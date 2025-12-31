// Get the elements from the DOM
const timeDisplay = document.getElementById('time-display');
const dateDisplay = document.getElementById('date-display');
const clockContainer = document.getElementById('clock-container');

/**
 * Formats a number to be two digits by adding a leading zero if needed.
 * @param {number} num - The number to format.
 * @returns {string} The formatted two-digit number as a string.
 */
function formatTwoDigits(num) {
    return num < 10 ? '0' + num : num;
}

/**
 * Updates the clock display with the current time and date.
 */
function updateClock() {
    const now = new Date();

    // Format time as HH:MM:SS
    const hours = formatTwoDigits(now.getHours());
    const minutes = formatTwoDigits(now.getMinutes());
    const seconds = formatTwoDigits(now.getSeconds());
    const timeString = `${hours}:${minutes}`;

    // Format date using Intl.DateTimeFormat for a nice, localized string
    const dateOptions = { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' };
    const dateString = new Intl.DateTimeFormat('en-US', dateOptions).format(now);

    // Update the content of the display elements
    timeDisplay.textContent = timeString;
    dateDisplay.textContent = dateString;
    
    // Fade in the clock on first load by removing the class that makes it invisible.
    // The CSS transition property will handle the smooth fade-in.
    // This check ensures we only modify the class list once.
    if (clockContainer.classList.contains('opacity-0')) {
        clockContainer.classList.remove('opacity-0');
    }
}

// --- Main Execution ---

// Call updateClock immediately to prevent initial delay
updateClock();

// Set an interval to update the clock every second (1000 milliseconds)
setInterval(updateClock, 1000);

// --- Calendar Functionality ---

const calendarModal = document.getElementById('calendar-modal');
const closeCalendarBtn = document.getElementById('close-calendar');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const prevYearBtn = document.getElementById('prev-year');
const nextYearBtn = document.getElementById('next-year');
const calendarMonthYear = document.getElementById('calendar-month-year');
const calendarDays = document.getElementById('calendar-days');
const calendarWeekdays = document.getElementById('calendar-weekdays');
const todayCalendarBtn = document.getElementById('today-calendar');

let currentCalendarDate = new Date();
let calendarView = 'days'; // 'days', 'months', 'years'

// Add cursor pointer to header to indicate interactivity
calendarMonthYear.classList.add('cursor-pointer', 'hover:text-blue-400', 'transition-colors');

function renderDays(date) {
    const year = date.getFullYear();
    const month = date.getMonth();

    // Set header
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
    calendarMonthYear.textContent = `${monthName} ${year}`;

    // Show weekdays
    calendarWeekdays.classList.remove('hidden');

    // Setup grid
    calendarDays.className = 'grid grid-cols-7 gap-1 text-center';
    calendarDays.innerHTML = '';

    // Get first day of the month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    // Empty slots
    for (let i = 0; i < startingDay; i++) {
        calendarDays.appendChild(document.createElement('div'));
    }

    // Days
    for (let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.textContent = i;
        dayDiv.classList.add('text-sm', 'py-1', 'rounded', 'hover:bg-gray-700', 'cursor-pointer');
        
        const currentDate = new Date(year, month, i);

        // Check for tasks
        let hasTask = false;
        if (typeof todoApp !== 'undefined' && todoApp.todos) {
            hasTask = todoApp.todos.some(todo => {
                if (!todo.archived && todo.meta_data && typeof todo.meta_data.dueTime === 'number') {
                    const dueDate = new Date(todo.meta_data.dueTime * 1000);
                    return dueDate.toDateString() === currentDate.toDateString();
                }
                return false;
            });
        }

        if (isCurrentMonth && i === today.getDate()) {
            dayDiv.classList.add('bg-blue-600', 'text-white', 'font-bold');
        } else if (hasTask) {
             dayDiv.classList.add('text-orange-500', 'font-bold');
        } else {
            dayDiv.classList.add('text-gray-300');
        }

        dayDiv.addEventListener('click', () => {
             const clickedDate = new Date(year, month, i);
             if (typeof todoApp !== 'undefined' && todoApp.filterByDate) {
                 todoApp.filterByDate(clickedDate);
             }
             closeCalendar();
        });

        calendarDays.appendChild(dayDiv);
    }
}

function renderMonths(date) {
    const year = date.getFullYear();
    calendarMonthYear.textContent = `${year}`;

    // Hide weekdays
    calendarWeekdays.classList.add('hidden');

    // Setup grid
    calendarDays.className = 'grid grid-cols-3 gap-2 text-center';
    calendarDays.innerHTML = '';

    const monthNames = [];
    for (let i = 0; i < 12; i++) {
        monthNames.push(new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(year, i, 1)));
    }

    const currentMonth = new Date().getMonth();
    const isCurrentYear = new Date().getFullYear() === year;

    monthNames.forEach((name, index) => {
        const monthDiv = document.createElement('div');
        monthDiv.textContent = name;
        monthDiv.classList.add('py-3', 'rounded', 'hover:bg-gray-700', 'cursor-pointer', 'text-gray-300');

        if (isCurrentYear && index === currentMonth) {
            monthDiv.classList.add('bg-blue-600', 'text-white', 'font-bold');
        }

        monthDiv.addEventListener('click', () => {
            currentCalendarDate.setMonth(index);
            calendarView = 'days';
            updateCalendarView();
        });

        calendarDays.appendChild(monthDiv);
    });
}

function renderYears(date) {
    const currentYear = date.getFullYear();
    const startYear = Math.floor(currentYear / 10) * 10;
    const endYear = startYear + 9; // Range inclusive
    // Show a slightly wider range for better UX? Usually standard decades.

    calendarMonthYear.textContent = `${startYear} - ${endYear}`;

    // Hide weekdays
    calendarWeekdays.classList.add('hidden');

    // Setup grid
    calendarDays.className = 'grid grid-cols-4 gap-2 text-center';
    calendarDays.innerHTML = '';

    // Render years. Maybe include one before and one after?
    // Let's do startYear - 1 to endYear + 2 to fill 12 slots? 
    // Or just 10 years. 10 doesn't fit nicely in grid-4.
    // 12 slots: startYear - 1 to startYear + 10.
    
    const displayStart = startYear - 1;
    const displayEnd = startYear + 10;

    const todayYear = new Date().getFullYear();

    for (let i = displayStart; i <= displayEnd; i++) {
        const yearDiv = document.createElement('div');
        yearDiv.textContent = i;
        yearDiv.classList.add('py-3', 'rounded', 'hover:bg-gray-700', 'cursor-pointer', 'text-gray-300');

        if (i === todayYear) {
             yearDiv.classList.add('bg-blue-600', 'text-white', 'font-bold');
        } else if (i < startYear || i > endYear) {
            yearDiv.classList.add('text-gray-600'); // Out of decade
        }

        yearDiv.addEventListener('click', () => {
            currentCalendarDate.setFullYear(i);
            calendarView = 'months';
            updateCalendarView();
        });

        calendarDays.appendChild(yearDiv);
    }
}

function updateCalendarView() {
    if (calendarView === 'days') {
        renderDays(currentCalendarDate);
        // Show month nav buttons
        if(prevMonthBtn) prevMonthBtn.style.visibility = 'visible';
        if(nextMonthBtn) nextMonthBtn.style.visibility = 'visible';
    } else if (calendarView === 'months') {
        renderMonths(currentCalendarDate);
        // Hide month nav buttons
        if(prevMonthBtn) prevMonthBtn.style.visibility = 'hidden';
        if(nextMonthBtn) nextMonthBtn.style.visibility = 'hidden';
    } else if (calendarView === 'years') {
        renderYears(currentCalendarDate);
        // Hide month nav buttons
        if(prevMonthBtn) prevMonthBtn.style.visibility = 'hidden';
        if(nextMonthBtn) nextMonthBtn.style.visibility = 'hidden';
    }
}

// Header click handler
calendarMonthYear.addEventListener('click', () => {
    if (calendarView === 'days') {
        calendarView = 'months';
    } else if (calendarView === 'months') {
        calendarView = 'years';
    }
    updateCalendarView();
});

function openCalendar() {
    currentCalendarDate = new Date(); // Reset to current date
    calendarView = 'days';
    updateCalendarView();
    calendarModal.classList.remove('hidden');
}

function closeCalendar() {
    calendarModal.classList.add('hidden');
}

// Event Listeners
if (timeDisplay) timeDisplay.addEventListener('click', openCalendar);
if (dateDisplay) dateDisplay.addEventListener('click', openCalendar);
if (closeCalendarBtn) closeCalendarBtn.addEventListener('click', closeCalendar);

// Close on click outside
if (calendarModal) {
    calendarModal.addEventListener('click', (e) => {
        if (e.target === calendarModal) {
            closeCalendar();
        }
    });
}

// Navigation Buttons
if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', (e) => {
        if (calendarView === 'days') {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            updateCalendarView();
        }
    });
}

if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', (e) => {
        if (calendarView === 'days') {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            updateCalendarView();
        }
    });
}

if (prevYearBtn) {
    prevYearBtn.addEventListener('click', (e) => {
        if (calendarView === 'days' || calendarView === 'months') {
            currentCalendarDate.setFullYear(currentCalendarDate.getFullYear() - 1);
        } else if (calendarView === 'years') {
             currentCalendarDate.setFullYear(currentCalendarDate.getFullYear() - 10);
        }
        updateCalendarView();
    });
}

if (nextYearBtn) {
    nextYearBtn.addEventListener('click', (e) => {
        if (calendarView === 'days' || calendarView === 'months') {
            currentCalendarDate.setFullYear(currentCalendarDate.getFullYear() + 1);
        } else if (calendarView === 'years') {
             currentCalendarDate.setFullYear(currentCalendarDate.getFullYear() + 10);
        }
        updateCalendarView();
    });
}

if (todayCalendarBtn) {
    todayCalendarBtn.addEventListener('click', () => {
        currentCalendarDate = new Date();
        calendarView = 'days';
        updateCalendarView();
    });
}

