class TodoList {
    constructor() {
        this.todos = [];
        this.credentials = null;
        
        this.todoInput = document.getElementById('todo-input');
        this.addTodoBtn = document.getElementById('add-todo-btn');
        this.todoList = document.getElementById('todo-list');
        this.emptyState = document.getElementById('empty-state');
        this.todoStats = document.getElementById('todo-stats');
        this.completedCount = document.getElementById('completed-count');
        this.totalCount = document.getElementById('total-count');
        
        // Due Date Modal Elements
        this.dueDateModal = document.getElementById('due-date-modal');
        this.dueDateInput = document.getElementById('due-date-input');
        this.dueDateDisplay = document.getElementById('due-date-display');
        this.dueHourInput = document.getElementById('due-hour-input');
        this.dueMinuteInput = document.getElementById('due-minute-input');
        this.saveDueDateBtn = document.getElementById('save-due-date');
        this.clearDueDateBtn = document.getElementById('clear-due-date');
        this.cancelDueDateBtn = document.getElementById('cancel-due-date');
        
        // Login Modal Elements
        this.loginModal = document.getElementById('login-modal');
        this.loginForm = document.getElementById('login-form');
        this.usernameInput = document.getElementById('username-input');
        this.passwordInput = document.getElementById('password-input');
        this.loginError = document.getElementById('login-error');
        
        // Menu Elements
        this.menuBtn = document.getElementById('todo-menu-btn');
        this.menuDropdown = document.getElementById('todo-menu-dropdown');
        this.exportBtn = document.getElementById('export-todos-btn');
        this.importBtn = document.getElementById('import-todos-btn');
        this.importInput = document.getElementById('import-todos-input');

        this.currentTodoId = null;
        this.showArchived = false;
        this.filterDate = null;
        this.autoRefreshTimeout = null;
        
        this.tooltip = null;
        this.createTooltip();
        
        // Load credentials from session storage if available
        const storedCreds = sessionStorage.getItem('auth_creds');
        if (storedCreds) {
            this.credentials = storedCreds;
        }

        this.init();
    }
    
    // ... tooltip methods ...
    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'fixed z-50 hidden bg-gray-900 text-white text-xs rounded px-2 py-1 shadow-lg pointer-events-none whitespace-nowrap border border-gray-700';
        document.body.appendChild(this.tooltip);
    }

    showTooltip(e) {
        const text = e.currentTarget.getAttribute('data-tooltip');
        if (!text || !this.tooltip) return;

        this.tooltip.textContent = text;
        this.tooltip.classList.remove('hidden');

        const rect = e.currentTarget.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();

        let top = rect.top - tooltipRect.height - 8;
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

        if (top < 0) {
             top = rect.bottom + 8;
        }

        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.left = `${left}px`;
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.add('hidden');
        }
    }

    init() {
        this.addTodoBtn.addEventListener('click', () => this.addTodo());
        this.todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTodo();
        });
        
        this.initLogin();
        this.initMenu();
        
        // Modal Event Listeners
        if (this.saveDueDateBtn) this.saveDueDateBtn.addEventListener('click', () => this.saveDueDate());
        if (this.clearDueDateBtn) this.clearDueDateBtn.addEventListener('click', () => this.clearDueDate());
        if (this.cancelDueDateBtn) this.cancelDueDateBtn.addEventListener('click', () => this.closeDueDateModal());
        if (this.dueDateInput) {
            this.dueDateInput.addEventListener('change', () => this.updateDueDateDisplay());
            this.dueDateInput.addEventListener('click', (e) => {
                if ('showPicker' in HTMLInputElement.prototype) {
                    try {
                        this.dueDateInput.showPicker();
                    } catch (error) {
                        console.error('Error showing date picker:', error);
                    }
                }
            });
        }
        if (this.dueDateModal) {
            this.dueDateModal.addEventListener('click', (e) => {
                if (e.target === this.dueDateModal) this.closeDueDateModal();
            });
        }
        
        this.fetchTodos();
    }
    
    initLogin() {
        if (this.loginForm) {
            this.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const username = this.usernameInput.value;
                const password = this.passwordInput.value;
                
                // Create Basic Auth string
                this.credentials = btoa(`${username}:${password}`);
                
                // Try to fetch todos to verify credentials
                this.fetchTodos(true);
            });
        }
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.credentials) {
            headers['Authorization'] = `Basic ${this.credentials}`;
        }
        return headers;
    }
    
    handleAuthError(response) {
        if (response.status === 401) {
            this.loginModal.classList.remove('hidden');
            if (this.credentials) {
                // If we had credentials but got 401, they are wrong
                this.loginError.classList.remove('hidden');
                this.credentials = null;
                sessionStorage.removeItem('auth_creds');
            }
            return true;
        }
        return false;
    }

    filterByDate(date) {
        this.filterDate = date;
        const dateString = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
        const titleText = document.getElementById('todo-list-title-text');
        
        if (titleText) {
            titleText.innerHTML = `Todo List (${dateString}) 
                <button id="reset-filter-btn" onclick="todoApp.resetFilter()" class="ml-2 text-red-400 hover:text-red-300 transition-colors inline-block align-middle" title="Reset Filter">
                    <img src="resource/go-back-arrow.svg" class="w-5 h-5" alt="Reset Filter">
                </button>`;
        }
        this.render();
    }

    resetFilter() {
        this.filterDate = null;
        const titleText = document.getElementById('todo-list-title-text');
        if (titleText) {
            titleText.textContent = 'Todo List';
        }
        this.render();
    }

    // ... openDueDateModal, closeDueDateModal, updateDueDateDisplay ...
    openDueDateModal(id) {
        this.currentTodoId = id;
        const todo = this.todos.find(t => t.id === id);
        
        const toLocalDateString = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        if (todo && todo.meta_data && typeof todo.meta_data.dueTime === 'number') {
            const date = new Date(todo.meta_data.dueTime * 1000);
            this.dueDateInput.value = toLocalDateString(date);
            this.dueHourInput.value = date.getHours();
            this.dueMinuteInput.value = date.getMinutes();
            this.clearDueDateBtn.classList.remove('hidden');
        } else {
            const now = new Date();
            this.dueDateInput.value = toLocalDateString(now);
            this.dueHourInput.value = (now.getHours() + 1) % 24;
            this.dueMinuteInput.value = 0;
            this.clearDueDateBtn.classList.add('hidden');
        }
        
        this.updateDueDateDisplay();
        this.dueDateModal.classList.remove('hidden');
    }

    closeDueDateModal() {
        this.dueDateModal.classList.add('hidden');
        this.currentTodoId = null;
    }

    updateDueDateDisplay() {
        if (!this.dueDateInput || !this.dueDateDisplay) return;
        const dateVal = this.dueDateInput.value;
        if (dateVal) {
            const date = new Date(dateVal + 'T00:00:00');
            const options = { month: 'short', day: 'numeric', year: 'numeric' };
            this.dueDateDisplay.value = new Intl.DateTimeFormat('en-US', options).format(date);
        } else {
            this.dueDateDisplay.value = '';
        }
    }

    async clearDueDate() {
        if (this.currentTodoId === null) return;
        
        const todo = this.todos.find(t => t.id === this.currentTodoId);
        if (todo) {
            const currentMeta = todo.meta_data || {};
            const updatedMeta = { ...currentMeta };
            delete updatedMeta.dueTime;
            
            const updatedTodo = { ...todo, meta_data: updatedMeta };
            
            try {
                const response = await fetch(`/api/todos/${this.currentTodoId}`, {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify(updatedTodo)
                });
                
                if (this.handleAuthError(response)) return;

                if (response.ok) {
                    todo.meta_data = updatedMeta;
                    this.render();
                    this.closeDueDateModal();
                }
            } catch (error) {
                console.error('Error clearing due date:', error);
            }
        }
    }

    async saveDueDate() {
        if (this.currentTodoId === null) return;
        
        const dateVal = this.dueDateInput.value;
        const hourVal = parseInt(this.dueHourInput.value);
        const minuteVal = parseInt(this.dueMinuteInput.value);
        
        if (!dateVal || isNaN(hourVal) || isNaN(minuteVal) || 
            hourVal < 0 || hourVal > 23 || minuteVal < 0 || minuteVal > 59) {
            alert('Please enter a valid date and time.');
            return;
        }
        
        const dateTime = new Date(`${dateVal}T00:00:00`);
        dateTime.setHours(hourVal);
        dateTime.setMinutes(minuteVal);
        
        const epochSeconds = Math.floor(dateTime.getTime() / 1000);
        
        const todo = this.todos.find(t => t.id === this.currentTodoId);
        if (todo) {
            const currentMeta = todo.meta_data || {};
            const updatedMeta = { ...currentMeta, dueTime: epochSeconds };
            const updatedTodo = { ...todo, meta_data: updatedMeta };
            
            try {
                const response = await fetch(`/api/todos/${this.currentTodoId}`, {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify(updatedTodo)
                });
                
                if (this.handleAuthError(response)) return;

                if (response.ok) {
                    todo.meta_data = updatedMeta;
                    this.render();
                    this.closeDueDateModal();
                }
            } catch (error) {
                console.error('Error saving due date:', error);
            }
        }
    }

    async fetchTodos(isLoginAttempt = false) {
        try {
            const response = await fetch('/api/todos', {
                headers: this.getHeaders()
            });
            
            if (this.handleAuthError(response)) return;

            if (response.ok) {
                this.todos = await response.json();
                this.render();
                
                if (isLoginAttempt) {
                    this.loginModal.classList.add('hidden');
                    this.loginError.classList.add('hidden');
                    sessionStorage.setItem('auth_creds', this.credentials);
                }
            } else {
                console.error('Failed to fetch todos');
            }
        } catch (error) {
            console.error('Error fetching todos:', error);
        }
    }
    
    async addTodo() {
        const text = this.todoInput.value.trim();
        if (text === '') return;
        
        const todo = {
            text: text,
            completed: false,
            archived: false
        };
        
        try {
            const response = await fetch('/api/todos', {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(todo)
            });

            if (this.handleAuthError(response)) return;

            if (response.ok) {
                const newTodo = await response.json();
                this.todos.unshift(newTodo); 
                this.todoInput.value = '';
                this.render();
                this.todoInput.focus();
            }
        } catch (error) {
            console.error('Error adding todo:', error);
        }
    }
    
    async toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            const updatedTodo = { ...todo, completed: !todo.completed };
            try {
                const response = await fetch(`/api/todos/${id}`, {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify(updatedTodo)
                });
                
                if (this.handleAuthError(response)) return;
                
                if (response.ok) {
                    todo.completed = updatedTodo.completed;
                    this.render();
                }
            } catch (error) {
                console.error('Error toggling todo:', error);
            }
        }
    }
    
    async archiveTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            const updatedTodo = { ...todo, archived: true };
            try {
                const response = await fetch(`/api/todos/${id}`, {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify(updatedTodo)
                });
                
                if (this.handleAuthError(response)) return;
                
                if (response.ok) {
                    todo.archived = true;
                    this.render();
                }
            } catch (error) {
                console.error('Error archiving todo:', error);
            }
        }
    }

    async unarchiveTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            const updatedTodo = { ...todo, archived: false };
            try {
                const response = await fetch(`/api/todos/${id}`, {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify(updatedTodo)
                });
                
                if (this.handleAuthError(response)) return;
                
                if (response.ok) {
                    todo.archived = false;
                    this.render();
                }
            } catch (error) {
                console.error('Error unarchiving todo:', error);
            }
        }
    }

    async deleteTodo(id) {
        if (!confirm('Are you sure you want to delete this task?')) return;
        
        try {
            const response = await fetch(`/api/todos/${id}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            
            if (this.handleAuthError(response)) return;
            
            if (response.ok) {
                this.todos = this.todos.filter(t => t.id !== id);
                this.render();
            }
        } catch (error) {
            console.error('Error deleting todo:', error);
        }
    }
    
    async editTodo(id, newText) {
        const todo = this.todos.find(t => t.id === id);
        if (todo && newText.trim() !== '') {
            const updatedTodo = { ...todo, text: newText.trim() };
            try {
                const response = await fetch(`/api/todos/${id}`, {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify(updatedTodo)
                });
                
                if (this.handleAuthError(response)) return;
                
                if (response.ok) {
                    todo.text = updatedTodo.text;
                    this.render();
                }
            } catch (error) {
                console.error('Error editing todo:', error);
            }
        }
    }
    
    // ... scheduleAutoRefresh, render, createTodoElement, startEdit, updateStats, escapeHtml ...
    scheduleAutoRefresh(forceDelay = null) {
        if (this.autoRefreshTimeout) clearTimeout(this.autoRefreshTimeout);
        
        let delay = forceDelay;
        
        if (delay === null) {
            const now = Date.now();
            const delays = [];
            
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0);
            delays.push(midnight.getTime() - now);

            this.todos.forEach(t => {
                if (!t.archived && t.meta_data && typeof t.meta_data.dueTime === 'number') {
                    const dueTimeMs = t.meta_data.dueTime * 1000;
                    const diff = dueTimeMs - now;
                    if (diff > 0) {
                        delays.push(diff);
                    }
                }
            });
            
            delay = Math.min(...delays);
        }

        const finalDelay = Math.max(0, delay) + 50;
        
        if (finalDelay > 86400000) return;

        this.autoRefreshTimeout = setTimeout(() => {
            const isEditing = this.todoList.querySelector('input[type="text"]');
            const isModalOpen = !this.dueDateModal.classList.contains('hidden');
            
            if (!isEditing && !isModalOpen) {
                this.render();
            } else {
                this.scheduleAutoRefresh(1000);
            }
        }, finalDelay);
    }

    render() {
        this.todoList.innerHTML = '';
        
        let displayTodos = [...this.todos];

        displayTodos.sort((a, b) => {
            const aDue = (a.meta_data && typeof a.meta_data.dueTime === 'number') ? a.meta_data.dueTime : Infinity;
            const bDue = (b.meta_data && typeof b.meta_data.dueTime === 'number') ? b.meta_data.dueTime : Infinity;

            if (aDue !== bDue) {
                return aDue - bDue;
            }

            const aCreated = a.createdAt || '';
            const bCreated = b.createdAt || '';

            if (aCreated !== bCreated) {
                if (aCreated < bCreated) return -1;
                if (aCreated > bCreated) return 1;
            }

            const aText = a.text || '';            
            const bText = b.text || '';
            if (aText < bText) return -1;
            if (aText > bText) return 1;
            return 0;
        });

        if (this.filterDate) {
            displayTodos = displayTodos.filter(t => {
                if (t.meta_data && typeof t.meta_data.dueTime === 'number') {
                    const dueDate = new Date(t.meta_data.dueTime * 1000);
                    return dueDate.toDateString() === this.filterDate.toDateString();
                }
                return false;
            });
        }
        
        if (displayTodos.length === 0) {
            if (this.filterDate) {
                 this.todoList.innerHTML = `<div class="text-center text-gray-400 py-8">No tasks due on ${this.filterDate.toLocaleDateString()}</div>`;
                 this.todoStats.classList.add('hidden');
                 this.emptyState.classList.add('hidden');
                 this.scheduleAutoRefresh();
                 return;
            } else {
                this.emptyState.classList.remove('hidden');
                this.todoStats.classList.add('hidden');
                this.scheduleAutoRefresh();
                return;
            }
        }
        
        this.emptyState.classList.add('hidden');
        this.todoStats.classList.remove('hidden');
        
        const activeTodos = displayTodos.filter(t => !t.archived);
        const archivedTodos = displayTodos.filter(t => t.archived);

        activeTodos.forEach(todo => {
            const todoElement = this.createTodoElement(todo);
            this.todoList.appendChild(todoElement);
        });

        if (archivedTodos.length > 0 || this.showArchived) {
            const toggleBtnContainer = document.createElement('div');
            toggleBtnContainer.className = 'flex justify-center pt-2 pb-2';
            
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'text-xs text-gray-500 hover:text-gray-300 flex items-center space-x-1';
            toggleBtn.innerHTML = `
                <span>${this.showArchived ? 'Hide' : 'Show'} Archived (${archivedTodos.length})</span>
                <svg class="w-4 h-4 transform ${this.showArchived ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            `;
            toggleBtn.onclick = () => {
                this.showArchived = !this.showArchived;
                this.render();
            };
            
            toggleBtnContainer.appendChild(toggleBtn);
            this.todoList.appendChild(toggleBtnContainer);
        }

        if (this.showArchived) {
            const archivedContainer = document.createElement('div');
            archivedContainer.className = 'space-y-2 opacity-60 bg-gray-800/50 p-2 rounded-lg border border-gray-700';
            
            if (archivedTodos.length === 0) {
                archivedContainer.innerHTML = '<div class="text-center text-xs text-gray-600">No archived items</div>';
            } else {
                archivedTodos.forEach(todo => {
                    const todoElement = this.createTodoElement(todo);
                    archivedContainer.appendChild(todoElement);
                });
            }
            this.todoList.appendChild(archivedContainer);
        }
        
        this.updateStats();
        this.scheduleAutoRefresh();
    }
    
    createTodoElement(todo) {
        const div = document.createElement('div');
        div.className = `todo-item flex items-center space-x-3 p-3 bg-gray-700 rounded-lg ${todo.completed ? 'completed' : ''}`;
        
        const archiveAction = todo.archived 
            ? `todoApp.unarchiveTodo(${todo.id})` 
            : `todoApp.archiveTodo(${todo.id})`;
        const archiveTitle = todo.archived ? 'Unarchive task' : 'Archive task';
        const archiveIcon = todo.archived 
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>'
            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path>';

        let iconColorClass = 'text-gray-400';
        let titleText = 'No due date';

        if (todo.meta_data && typeof todo.meta_data.dueTime === 'number') {
            const dueTime = todo.meta_data.dueTime;
            const dueDate = new Date(dueTime * 1000);
            const now = new Date();
            
            const dateStr = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = dueDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            titleText = `${dateStr}, ${timeStr}`;
            iconColorClass = 'text-green-500';
            
            if (now.getTime() > dueDate.getTime()) {
                iconColorClass = 'text-red-500';
            } else if (now.toDateString() === dueDate.toDateString()) {
                iconColorClass = 'text-yellow-500';
            }
        }
            
        const clockIconHtml = `
            <div class="cursor-pointer hover:bg-gray-600 rounded p-1 transition-colors" 
                 onclick="todoApp.openDueDateModal(${todo.id})" 
                 data-tooltip="${titleText}"
                 onmouseenter="todoApp.showTooltip(event)"
                 onmouseleave="todoApp.hideTooltip()">
                <svg class="h-4 w-4 ${iconColorClass} flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
            </div>
        `;

        div.innerHTML = `
            <input 
                type="checkbox" 
                ${todo.completed ? 'checked' : ''} 
                class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-400 rounded"
                onchange="todoApp.toggleTodo(${todo.id})"
            >
            ${clockIconHtml}
            <span 
                class="todo-text flex-1 cursor-pointer" 
                onclick="todoApp.startEdit(${todo.id}, this)"
            >
                ${this.escapeHtml(todo.text)}
            </span>
            
            <button 
                onclick="${archiveAction}"
                class="text-gray-400 hover:text-blue-300 transition-colors duration-200 p-1"
                title="${archiveTitle}"
            >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    ${archiveIcon}
                </svg>
            </button>

            <button 
                onclick="todoApp.deleteTodo(${todo.id})" 
                class="text-red-400 hover:text-red-300 transition-colors duration-200 p-1"
                title="Delete task"
            >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        `;
        
        return div;
    }
    
    startEdit(id, element) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo || todo.completed) return;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = todo.text;
        input.className = 'flex-1 px-2 py-1 bg-gray-600 text-white rounded border border-gray-500 focus:border-blue-500 focus:outline-none';
        
        const finishEdit = () => {
            this.editTodo(id, input.value);
        };
        
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') finishEdit();
            if (e.key === 'Escape') this.render();
        });
        
        element.parentNode.replaceChild(input, element);
        input.focus();
        input.select();
    }
    
    updateStats() {
        const activeTodos = this.todos.filter(t => !t.archived);
        const completed = activeTodos.filter(t => t.completed).length;
        const total = activeTodos.length;
        
        this.completedCount.textContent = completed;
        this.totalCount.textContent = total;
    }

    initMenu() {
        if (this.menuBtn) {
            this.menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMenu();
            });
        }

        document.addEventListener('click', (e) => {
            if (this.menuDropdown && !this.menuDropdown.classList.contains('hidden') && !this.menuDropdown.contains(e.target) && !this.menuBtn.contains(e.target)) {
                this.menuDropdown.classList.add('hidden');
            }
        });

        if (this.exportBtn) {
            this.exportBtn.addEventListener('click', () => {
                this.exportTodos();
                this.menuDropdown.classList.add('hidden');
            });
        }

        if (this.importBtn) {
            this.importBtn.addEventListener('click', () => {
                this.importInput.click();
                this.menuDropdown.classList.add('hidden');
            });
        }

        if (this.importInput) {
            this.importInput.addEventListener('change', (e) => this.handleImportFile(e));
        }
    }

    toggleMenu() {
        if (this.menuDropdown) {
            this.menuDropdown.classList.toggle('hidden');
        }
    }

    exportTodos() {
        if (!this.todos || this.todos.length === 0) {
            alert('No todos to export!');
            return;
        }
        
        const dataStr = JSON.stringify(this.todos, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const exportFileDefaultName = `todo_backup_${new Date().toISOString().slice(0,10)}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', url);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedTodos = JSON.parse(e.target.result);
                if (Array.isArray(importedTodos)) {
                    if (confirm(`Found ${importedTodos.length} tasks in file. Import them now? This will add them to your current list.`)) {
                        this.processImport(importedTodos);
                    }
                } else {
                    alert('Invalid file format: Expected a list of tasks.');
                }
            } catch (error) {
                console.error('Error parsing JSON:', error);
                alert('Error parsing JSON file.');
            }
            // Reset input so same file can be selected again if needed
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    async processImport(todos) {
        // Reverse if they seem to be in descending order (ID based) so they get created in correct chronological order
        const todosToImport = [...todos].reverse();
        
        let count = 0;
        let authErrorOccurred = false;

        for (const todo of todosToImport) {
            if (authErrorOccurred) break;

            const newTodo = {
                text: todo.text || 'Untitled Task',
                completed: !!todo.completed,
                archived: !!todo.archived,
                meta_data: todo.meta_data || null,
                createdAt: todo.createdAt 
            };
            
            try {
                const response = await fetch('/api/todos', {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify(newTodo)
                });
                
                if (this.handleAuthError(response)) {
                    authErrorOccurred = true;
                    continue;
                }

                if (response.ok) {
                    count++;
                }
            } catch (error) {
                console.error('Error importing todo:', error);
            }
        }
        
        if (count > 0) {
            alert(`Successfully imported ${count} tasks.`);
            this.fetchTodos();
        } else if (!authErrorOccurred) {
            alert('No tasks were imported.');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the todo list
const todoApp = new TodoList();
