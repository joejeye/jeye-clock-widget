class TodoList {
    constructor() {
        this.todos = [];
        this.todoInput = document.getElementById('todo-input');
        this.addTodoBtn = document.getElementById('add-todo-btn');
        this.todoList = document.getElementById('todo-list');
        this.emptyState = document.getElementById('empty-state');
        this.todoStats = document.getElementById('todo-stats');
        this.completedCount = document.getElementById('completed-count');
        this.totalCount = document.getElementById('total-count');
        
        this.init();
    }
    
    init() {
        this.addTodoBtn.addEventListener('click', () => this.addTodo());
        this.todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTodo();
        });
        
        this.fetchTodos();
    }

    async fetchTodos() {
        try {
            const response = await fetch('/api/todos');
            if (response.ok) {
                this.todos = await response.json();
                this.render();
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
            completed: false
        };
        
        try {
            const response = await fetch('/api/todos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(todo)
            });

            if (response.ok) {
                const newTodo = await response.json();
                this.todos.unshift(newTodo); // Add to beginning (assuming backend sorts or we just prepend)
                // Actually backend sorts by ID desc, so unshift works if we refetch or just pretend.
                // Best practice: insert and re-render.
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
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedTodo)
                });
                
                if (response.ok) {
                    todo.completed = updatedTodo.completed;
                    this.render();
                }
            } catch (error) {
                console.error('Error toggling todo:', error);
            }
        }
    }
    
    async deleteTodo(id) {
        try {
            const response = await fetch(`/api/todos/${id}`, {
                method: 'DELETE'
            });
            
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
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedTodo)
                });
                
                if (response.ok) {
                    todo.text = updatedTodo.text;
                    this.render();
                }
            } catch (error) {
                console.error('Error editing todo:', error);
            }
        }
    }
    
    render() {
        this.todoList.innerHTML = '';
        
        if (this.todos.length === 0) {
            this.emptyState.classList.remove('hidden');
            this.todoStats.classList.add('hidden');
            return;
        }
        
        this.emptyState.classList.add('hidden');
        this.todoStats.classList.remove('hidden');
        
        this.todos.forEach(todo => {
            const todoElement = this.createTodoElement(todo);
            this.todoList.appendChild(todoElement);
        });
        
        this.updateStats();
    }
    
    createTodoElement(todo) {
        const div = document.createElement('div');
        div.className = `todo-item flex items-center space-x-3 p-3 bg-gray-700 rounded-lg ${todo.completed ? 'completed' : ''}`;
        
        div.innerHTML = `
            <input 
                type="checkbox" 
                ${todo.completed ? 'checked' : ''} 
                class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-400 rounded"
                onchange="todoApp.toggleTodo(${todo.id})"
            >
            <span 
                class="todo-text flex-1 cursor-pointer" 
                onclick="todoApp.startEdit(${todo.id}, this)"
            >
                ${this.escapeHtml(todo.text)}
            </span>
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
        const completed = this.todos.filter(t => t.completed).length;
        const total = this.todos.length;
        
        this.completedCount.textContent = completed;
        this.totalCount.textContent = total;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the todo list
const todoApp = new TodoList();
