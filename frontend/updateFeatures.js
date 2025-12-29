let showWeather = false;

function selectIcon(iconCode) {
    iconDir = './resource/iconfinder-lineart-weather/'
    switch (iconCode.substring(0, 2)) {
        case '01':
            if (iconCode.endsWith('d')) {
                return iconDir + '809988_day_sun_sunny_weather_icon.svg'
            }
            else {
                return iconDir + '810000_moon_night_weather_icon.svg'
            }
        case '02':
            if (iconCode.endsWith('d')) {
                return iconDir + '809977_cloud_overcast_sun_weather_icon.svg'
            }
            else {
                return iconDir + '809976_cloud_overcast_weather_icon.svg'
            }
        case '03':
            return iconDir + '809976_cloud_overcast_weather_icon.svg'
        case '04':
            return iconDir + '809978_cloud_clouds_overcast_weather_icon.svg'
        case '09':
            return iconDir + '809980_cloud_rain_rainy_weather_icon.svg'
        case '10':
            return iconDir + '809979_cloud_rain_rainy_weather_icon.svg'
        case '11':
            return iconDir + '809985_cloud_thunder_thunderbolt_weather_icon.svg'
        case '13':
            return iconDir + '809992_snowflake_weather_winter_icon.svg'
        case '50':
            return './resource/8680112_mist_fill_icon.svg'
        default:
            throw new Error('Unknown icon code: ' + iconCode)
    }
}

function getWeather() {
    const weatherInfoDiv = document.getElementById('weather-info');
    if (!showWeather) {
        weatherInfoDiv.innerHTML = '';
        return
    }

    if (!navigator.geolocation) {
        weatherInfoDiv.textContent = 'Geolocation is not supported by your browser';
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const params = new URLSearchParams({
                lat: latitude,
                lon: longitude,
                units: 'metric'
            })
            const callApi = () => {
                fetch(`/api/weather?${params.toString()}`)
                    .then(response => {
                        if (!response.ok) {
                            weatherInfoDiv.textContent = 'Error fetching weather data';
                            throw new Error('Network response was not ok');
                        }
                        return response.json();
                    })
                    .then(data => {
                        // console.log(data);
                        const temp = Math.round(data.current.temp);
                        const feelsLikeTemp = Math.round(data.current.feels_like);
                        const humidity = data.current.humidity;
                        const weatherDescription = data.current.weather[0].description;
                        const weatherIcon = data.current.weather[0].icon;
                        const iconUrl = selectIcon(weatherIcon)
                        // console.log('Selected icon URL:', iconUrl);
                        const sideLen = 40;
                        weatherInfoDiv.innerHTML = `
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <!--<span style="background-color: #b7b2b2ff; border-radius: 20%;">-->
                                    <span style="background-color: transparent; border-radius: 20%;">
                                    <img src="${iconUrl}" alt="${weatherDescription}" style="width: ${sideLen}px; height: ${sideLen}px;">
                                    </span>
                                    <span style="font-size: 1.5em; font-weight: bold;">
                                        ${temp}°C
                                    </span>
                                    <div style="width: 10px;"></div>
                                    <img src="./resource/temperature-feels-like.svg" alt="Feels like" style="width: ${sideLen}px; height: ${sideLen}px;">
                                    <span style="font-size: 1.5em; font-weight: bold;">
                                        ${feelsLikeTemp}°C
                                    </span>
                                    <div style="width: 10px;"></div>
                                    <img src="./resource/humidity-5.svg" alt="Humidity" style="width: ${sideLen}px; height: ${sideLen}px;">
                                    <span style="font-size: 1.5em; font-weight: bold;">
                                        ${humidity}%
                                    </span>
                                </div>
                                <div style="text-transform: capitalize;">${weatherDescription}</div>
                            </div>
                        `;
                    })
                    .catch(error => {
                        console.error('Error fetching weather data:', error);
                        weatherInfoDiv.textContent = 'Error fetching weather data: ' + error.message;
                    });
            }
            
            // Call immediately when location is obtained
            callApi();
        },
        (error) => {
            weatherInfoDiv.textContent = 'Unable to retrieve your location: ' + error.message;
        }
    )
}

const toggleWeatherBtn = document.getElementById('toggle-weather-btn');
toggleWeatherBtn.addEventListener('click', () => {
    showWeather = !showWeather;
    getWeather();
});

function updateFeatures() {
    getWeather();
}

updateFeatures();
setInterval(getWeather, 3 * 60 * 1000); // Update weather every 3 minutes
