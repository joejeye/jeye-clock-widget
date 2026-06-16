import httpx
import sys

BASE_URL = "http://localhost:19563"

def test_weather_api():
    # 1. Server reachable
    try:
        resp = httpx.get(f"{BASE_URL}/api/weather", params={"lat": 52.2297, "lon": 21.0122, "units": "metric"}, timeout=10)
    except httpx.ConnectError:
        print("FAIL — Backend server is not running on", BASE_URL)
        sys.exit(1)
    except Exception as e:
        print(f"FAIL — Request failed: {e}")
        sys.exit(1)

    print(f"Response status: {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        assert "data" in data, "Response missing 'data' array (v4.0 format)"
        assert len(data["data"]) > 0, "'data' array is empty"
        current = data["data"][0]
        for field in ("temp", "feels_like", "humidity", "weather"):
            assert field in current, f"Missing field '{field}' in current weather data"
        assert len(current["weather"]) > 0, "'weather' array is empty"
        print(f"OK — temp={current['temp']}°C, feels_like={current['feels_like']}°C, "
              f"humidity={current['humidity']}%, "
              f"description={current['weather'][0]['description']}")
    elif resp.status_code == 503:
        print("WARN — Upstream weather service unreachable (check API key / network)")
    elif resp.status_code == 500:
        print("WARN — Server error (check OPENWEATHER_API_KEY in .env)")
    else:
        print(f"WARN — Upstream returned {resp.status_code}: {resp.text}")

if __name__ == "__main__":
    test_weather_api()
