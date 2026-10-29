/**
 * APP.JS - Asynchronous REST API Weather Client
 * Features:
 * - Async/Await with the native Fetch API
 * - Comprehensive Network & HTTP error handling (HTTP 404, 500, Offline, Timeout)
 * - Nested JSON payload parsing & extraction
 * - Real-time metrics: Temperature, Humidity, Wind Speed, UV Index, Air Pressure
 * - 5-Day forecast synthesis
 * - Public REST APIs (Open-Meteo & Geocoding API - no API key required)
 */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. DOM Elements
  // -------------------------------------------------------------------------
  const searchForm = document.getElementById('search-form');
  const cityInput = document.getElementById('city-input');
  const quickPills = document.querySelectorAll('.city-pill');
  
  const loadingBanner = document.getElementById('status-loading');
  const errorBanner = document.getElementById('status-error');
  const errorMessage = document.getElementById('error-message');
  
  const weatherCard = document.getElementById('weather-card');
  const forecastSection = document.getElementById('forecast-section');
  
  // Weather Display Elements
  const elLocation = document.getElementById('weather-location');
  const elCountry = document.getElementById('weather-country');
  const elDate = document.getElementById('weather-date');
  const elConditionText = document.getElementById('weather-condition-text');
  const elIconLarge = document.getElementById('weather-icon-large');
  const elTemp = document.getElementById('weather-temp');
  const elDesc = document.getElementById('weather-desc');
  const elFeelsLike = document.getElementById('weather-feels-like');
  
  // Metrics Grid Elements
  const elHumidity = document.getElementById('metric-humidity');
  const elWind = document.getElementById('metric-wind');
  const elPressure = document.getElementById('metric-pressure');
  const elUv = document.getElementById('metric-uv');
  const elPrecip = document.getElementById('metric-precip');
  const elWindDir = document.getElementById('metric-wind-dir');
  
  const forecastGrid = document.getElementById('forecast-grid');

  // -------------------------------------------------------------------------
  // 2. WMO Weather Code Mapper
  // Converts Open-Meteo standard WMO weather codes into human labels & icons
  // -------------------------------------------------------------------------
  function interpretWeatherCode(code, isDay = 1) {
    const codeMap = {
      0: { label: 'Clear Sky', icon: isDay ? '☀️' : '🌙' },
      1: { label: 'Mainly Clear', icon: isDay ? '🌤️' : '🌑' },
      2: { label: 'Partly Cloudy', icon: '⛅' },
      3: { label: 'Overcast', icon: '☁️' },
      45: { label: 'Foggy', icon: '🌫️' },
      48: { label: 'Depositing Rime Fog', icon: '🌫️' },
      51: { label: 'Light Drizzle', icon: '🌦️' },
      53: { label: 'Moderate Drizzle', icon: '🌧️' },
      55: { label: 'Dense Drizzle', icon: '🌧️' },
      61: { label: 'Slight Rain', icon: '🌦️' },
      63: { label: 'Moderate Rain', icon: '🌧️' },
      65: { label: 'Heavy Rain', icon: '🌧️' },
      71: { label: 'Slight Snow Fall', icon: '🌨️' },
      73: { label: 'Moderate Snow Fall', icon: '❄️' },
      75: { label: 'Heavy Snow Fall', icon: '❄️' },
      80: { label: 'Slight Rain Showers', icon: '🌦️' },
      81: { label: 'Moderate Showers', icon: '🌧️' },
      82: { label: 'Violent Rain Showers', icon: '⛈️' },
      95: { label: 'Thunderstorm', icon: '⛈️' },
      96: { label: 'Thunderstorm with Hail', icon: '🌩️' },
      99: { label: 'Heavy Thunderstorm with Hail', icon: '⛈️' }
    };

    return codeMap[code] || { label: 'Moderate Conditions', icon: '🌤️' };
  }

  // -------------------------------------------------------------------------
  // 3. UI State Helpers
  // -------------------------------------------------------------------------
  function showLoading(cityName) {
    errorBanner.classList.remove('is-visible');
    loadingBanner.classList.add('is-visible');
    const loadingText = document.getElementById('loading-text');
    if (loadingText) loadingText.textContent = `Fetching live meteorological data for ${cityName}...`;
  }

  function hideLoading() {
    loadingBanner.classList.remove('is-visible');
  }

  function showError(msg) {
    hideLoading();
    weatherCard.classList.remove('is-visible');
    forecastSection.classList.remove('is-visible');
    errorMessage.textContent = msg;
    errorBanner.classList.add('is-visible');
  }

  function clearError() {
    errorBanner.classList.remove('is-visible');
  }

  // -------------------------------------------------------------------------
  // 4. Asynchronous Data Fetching & Processing Pipeline
  // -------------------------------------------------------------------------

  /**
   * Step 1: Geocoding API lookup (City name -> Latitude & Longitude)
   */
  async function fetchCoordinates(cityName) {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;

    const response = await fetch(geoUrl);
    if (!response.ok) {
      throw new Error(`Geocoding server responded with status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      throw new Error(`No geographic coordinates found for "${cityName}". Please check the spelling.`);
    }

    const firstResult = data.results[0];
    return {
      name: firstResult.name,
      country: firstResult.country || firstResult.country_code || '',
      admin1: firstResult.admin1 || '',
      lat: firstResult.latitude,
      lon: firstResult.longitude,
      timezone: firstResult.timezone || 'auto'
    };
  }

  /**
   * Step 2: Open-Meteo REST Weather Forecast API (Coordinates -> Real-time Weather JSON)
   */
  async function fetchWeatherData(lat, lon, timezone) {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&timezone=${encodeURIComponent(timezone)}&forecast_days=6`;

    const response = await fetch(weatherUrl);
    if (!response.ok) {
      throw new Error(`Weather API service failed with status ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Orchestrator: Main Async Controller Function
   */
  async function loadWeather(cityName) {
    const query = cityName.trim();
    if (!query) return;

    showLoading(query);

    try {
      // 1. Coordinate resolution
      const geo = await fetchCoordinates(query);

      // 2. Live meteorological data retrieval
      const weather = await fetchWeatherData(geo.lat, geo.lon, geo.timezone);

      // 3. Dynamic DOM presentation
      renderDashboard(geo, weather);

      hideLoading();
      clearError();

      // Save last searched city to localStorage
      localStorage.setItem('weather_last_city', geo.name);

    } catch (err) {
      console.error('Weather Fetch Error:', err);
      // User-friendly network failure handling
      if (!navigator.onLine) {
        showError('You appear to be offline. Please verify your internet connection.');
      } else {
        showError(err.message || 'An unexpected error occurred while fetching weather data.');
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Dynamic DOM Rendering
  // -------------------------------------------------------------------------
  function renderDashboard(geo, data) {
    const current = data.current;
    const daily = data.daily;
    const weatherInfo = interpretWeatherCode(current.weather_code, current.is_day);

    // Location & Date
    elLocation.textContent = geo.name;
    elCountry.textContent = geo.country ? `${geo.country}` : 'Global';
    elDate.textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Condition Badge & Hero Temp
    elConditionText.textContent = weatherInfo.label;
    elIconLarge.textContent = weatherInfo.icon;
    elTemp.textContent = Math.round(current.temperature_2m);
    elDesc.textContent = weatherInfo.label;
    elFeelsLike.textContent = `Feels like ${Math.round(current.apparent_temperature)}°C`;

    // Metrics Grid
    elHumidity.textContent = `${current.relative_humidity_2m}%`;
    elWind.textContent = `${current.wind_speed_10m} km/h`;
    elPressure.textContent = `${Math.round(current.surface_pressure)} hPa`;
    elUv.textContent = daily && daily.uv_index_max ? daily.uv_index_max[0] : 'N/A';
    elPrecip.textContent = `${current.precipitation} mm`;
    elWindDir.textContent = `${current.wind_direction_10m}°`;

    // 5-Day Forecast Rendering
    if (daily && daily.time) {
      forecastGrid.innerHTML = '';
      const fragment = document.createDocumentFragment();

      // Start from index 1 (tomorrow) up to index 5
      for (let i = 1; i < Math.min(daily.time.length, 6); i++) {
        const dateStr = daily.time[i];
        const dateObj = new Date(dateStr + 'T00:00:00');
        const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
        const code = daily.weather_code[i];
        const dayInfo = interpretWeatherCode(code, 1);
        const maxTemp = Math.round(daily.temperature_2m_max[i]);
        const minTemp = Math.round(daily.temperature_2m_min[i]);

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
          <span class="forecast-day">${dayName}</span>
          <span class="forecast-icon" aria-label="${dayInfo.label}">${dayInfo.icon}</span>
          <div class="forecast-temps">
            <span class="forecast-high">${maxTemp}°</span>
            <span class="forecast-low">${minTemp}°</span>
          </div>
        `;
        fragment.appendChild(card);
      }

      forecastGrid.appendChild(fragment);
      forecastSection.classList.add('is-visible');
    }

    weatherCard.classList.add('is-visible');
  }

  // -------------------------------------------------------------------------
  // 6. Event Listeners & Bootstrapping
  // -------------------------------------------------------------------------
  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const city = cityInput.value.trim();
    if (city) {
      loadWeather(city);
    }
  });

  // Quick City Filter Pills
  quickPills.forEach(pill => {
    pill.addEventListener('click', function () {
      const city = pill.dataset.city;
      cityInput.value = city;
      loadWeather(city);
    });
  });

  // Initial Load: Last searched city or default to "London"
  const defaultCity = localStorage.getItem('weather_last_city') || 'London';
  cityInput.value = defaultCity;
  loadWeather(defaultCity);

})();
