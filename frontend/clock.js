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
