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
const calendarMonthYear = document.getElementById('calendar-month-year');
const calendarDays = document.getElementById('calendar-days');

let currentCalendarDate = new Date();

function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();

    // Set month and year in header
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
    calendarMonthYear.textContent = `${monthName} ${year}`;

    // Clear previous days
    calendarDays.innerHTML = '';

    // Get first day of the month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Days in month
    const daysInMonth = lastDay.getDate();
    
    // Day of week of the first day (0-6, Sun-Sat)
    const startingDay = firstDay.getDay();

    // Today's date for highlighting
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    // Add empty slots for days before the first day
    for (let i = 0; i < startingDay; i++) {
        const emptyDiv = document.createElement('div');
        calendarDays.appendChild(emptyDiv);
    }

    // Add days
    for (let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.textContent = i;
        dayDiv.classList.add('text-sm', 'py-1', 'rounded', 'hover:bg-gray-700', 'cursor-pointer');
        
        if (isCurrentMonth && i === today.getDate()) {
            dayDiv.classList.add('bg-blue-600', 'text-white', 'font-bold');
        } else {
            dayDiv.classList.add('text-gray-300');
        }

        calendarDays.appendChild(dayDiv);
    }
}

function openCalendar() {
    currentCalendarDate = new Date(); // Reset to current date when opening
    renderCalendar(currentCalendarDate);
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

if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar(currentCalendarDate);
    });
}

if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar(currentCalendarDate);
    });
}

