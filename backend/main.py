import logging
import os
import yaml
import secrets
import asyncio
import math
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Tuple, Optional
import sqlite3
from pathlib import Path

import httpx
from pydantic import BaseModel
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from dotenv import load_dotenv

from models import Todo
from database import create_db_and_tables, get_session

# Load env
load_dotenv()

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load config
try:
    with open("config.yaml") as f:
        config = yaml.safe_load(f)
except FileNotFoundError:
    config = {}

PORT = config.get("port", 8000)
API_KEY = os.getenv("OPENWEATHER_API_KEY")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")

# Weather caching / upstream request throttling.
# We intentionally limit outbound OpenWeather calls to at most once
# every 5 minutes per normalized location+unit key.
WEATHER_CACHE_TTL_SECONDS = 5 * 60
WEATHER_COORD_PRECISION = 3  # ~100m precision; smooths minor geolocation jitter
WEATHER_FORCE_REFRESH_DISTANCE_KM = 2.0
weather_cache: Dict[Tuple[float, float, str], Dict[str, Any]] = {}
weather_cache_locks: Dict[Tuple[float, float, str], asyncio.Lock] = {}
weather_cache_guard = asyncio.Lock()
weather_last_position: Optional[Tuple[float, float]] = None

# Reverse geocode caching / upstream request throttling.
REVERSE_GEOCODE_CACHE_TTL_SECONDS = 60
REVERSE_GEOCODE_COORD_PRECISION = 3  # keep aligned with weather precision
REVERSE_GEOCODE_FORCE_REFRESH_DISTANCE_KM = 2.0
reverse_geocode_cache: Dict[Tuple[float, float], Dict[str, Any]] = {}
reverse_geocode_cache_locks: Dict[Tuple[float, float], asyncio.Lock] = {}
reverse_geocode_cache_guard = asyncio.Lock()
reverse_geocode_last_position: Optional[Tuple[float, float]] = None

security = HTTPBasic()


def _normalize_weather_key(lat: float, lon: float, units: str) -> Tuple[float, float, str]:
    return (round(lat, WEATHER_COORD_PRECISION), round(lon, WEATHER_COORD_PRECISION), units.lower())


def _is_weather_cache_fresh(cached_at: datetime, now: datetime) -> bool:
    age_seconds = (now - cached_at).total_seconds()
    return age_seconds < WEATHER_CACHE_TTL_SECONDS


def _normalize_reverse_geocode_key(lat: float, lon: float) -> Tuple[float, float]:
    return (round(lat, REVERSE_GEOCODE_COORD_PRECISION), round(lon, REVERSE_GEOCODE_COORD_PRECISION))


def _is_reverse_geocode_cache_fresh(cached_at: datetime, now: datetime) -> bool:
    age_seconds = (now - cached_at).total_seconds()
    return age_seconds < REVERSE_GEOCODE_CACHE_TTL_SECONDS


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    return 2 * earth_radius_km * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _should_force_location_refresh(
    lat: float,
    lon: float,
    last_position: Optional[Tuple[float, float]],
    threshold_km: float,
) -> bool:
    if last_position is None:
        return False
    distance = _distance_km(lat, lon, last_position[0], last_position[1])
    return distance > threshold_km


async def _get_weather_lock(cache_key: Tuple[float, float, str]) -> asyncio.Lock:
    async with weather_cache_guard:
        lock = weather_cache_locks.get(cache_key)
        if lock is None:
            lock = asyncio.Lock()
            weather_cache_locks[cache_key] = lock
        return lock


async def _get_reverse_geocode_lock(cache_key: Tuple[float, float]) -> asyncio.Lock:
    async with reverse_geocode_cache_guard:
        lock = reverse_geocode_cache_locks.get(cache_key)
        if lock is None:
            lock = asyncio.Lock()
            reverse_geocode_cache_locks[cache_key] = lock
        return lock


def _build_weather_response(payload: Any, cached: bool, cached_at: datetime) -> Any:
    """
    Return upstream weather payload with backend cache metadata.
    If payload is a dict (OpenWeather response), inject `cached` flag and
    `next_refresh_at` (UTC ISO string) indicating when the cache entry expires.
    """
    if isinstance(payload, dict):
        response_payload = dict(payload)
        response_payload["cached"] = cached
        next_refresh_at = cached_at + timedelta(seconds=WEATHER_CACHE_TTL_SECONDS)
        response_payload["next_refresh_at"] = next_refresh_at.isoformat()
        return response_payload
    return payload

def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    current_username_bytes = credentials.username.encode("utf8")
    correct_username_bytes = ADMIN_USERNAME.encode("utf8")
    is_correct_username = secrets.compare_digest(
        current_username_bytes, correct_username_bytes
    )
    
    current_password_bytes = credentials.password.encode("utf8")
    correct_password_bytes = ADMIN_PASSWORD.encode("utf8")
    is_correct_password = secrets.compare_digest(
        current_password_bytes, correct_password_bytes
    )
    
    if not (is_correct_username and is_correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
@app.get("/api/todos", response_model=List[Todo])
def read_todos(session: Session = Depends(get_session), username: str = Depends(get_current_username)):
    # Sort by ID desc (newest first) to match original behavior roughly
    # Original behavior was unshift() -> newest at top.
    todos = session.exec(select(Todo).order_by(Todo.id.desc())).all()
    return todos

@app.post("/api/todos", response_model=Todo)
def create_todo(todo: Todo, session: Session = Depends(get_session), username: str = Depends(get_current_username)):
    session.add(todo)
    session.commit()
    session.refresh(todo)
    return todo

@app.put("/api/todos/{todo_id}", response_model=Todo)
def update_todo(todo_id: int, todo_update: Todo, session: Session = Depends(get_session), username: str = Depends(get_current_username)):
    todo = session.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    # Update fields
    todo.text = todo_update.text
    todo.completed = todo_update.completed
    todo.archived = todo_update.archived
    todo.meta_data = todo_update.meta_data
    # We don't update createdAt usually
    
    session.add(todo)
    session.commit()
    session.refresh(todo)
    return todo

@app.delete("/api/todos/{todo_id}")
def delete_todo(todo_id: int, session: Session = Depends(get_session), username: str = Depends(get_current_username)):
    todo = session.get(Todo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    session.delete(todo)
    session.commit()
    return {"ok": True}

@app.get("/api/geocode")
async def reverse_geocode(lat: float, lon: float):
    global reverse_geocode_last_position

    cache_key = _normalize_reverse_geocode_key(lat, lon)
    now = datetime.now(timezone.utc)
    force_refresh = _should_force_location_refresh(
        lat, lon, reverse_geocode_last_position, REVERSE_GEOCODE_FORCE_REFRESH_DISTANCE_KM
    )

    cached_entry = reverse_geocode_cache.get(cache_key)
    if not force_refresh and cached_entry and _is_reverse_geocode_cache_fresh(cached_entry["cached_at"], now):
        logger.info("Reverse geocode cache HIT for key=%s", cache_key)
        reverse_geocode_last_position = (lat, lon)
        return {"city": cached_entry["city"]}

    if force_refresh:
        logger.info(
            "Reverse geocode force refresh: moved > %.1f km from last position",
            REVERSE_GEOCODE_FORCE_REFRESH_DISTANCE_KM,
        )

    lock = await _get_reverse_geocode_lock(cache_key)
    async with lock:
        now = datetime.now(timezone.utc)
        force_refresh = _should_force_location_refresh(
            lat, lon, reverse_geocode_last_position, REVERSE_GEOCODE_FORCE_REFRESH_DISTANCE_KM
        )
        cached_entry = reverse_geocode_cache.get(cache_key)
        if not force_refresh and cached_entry and _is_reverse_geocode_cache_fresh(cached_entry["cached_at"], now):
            logger.info("Reverse geocode cache HIT-after-lock for key=%s", cache_key)
            reverse_geocode_last_position = (lat, lon)
            return {"city": cached_entry["city"]}

        logger.info("Reverse geocode cache MISS for key=%s; calling Nominatim", cache_key)
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {"format": "json", "lat": lat, "lon": lon}
        headers = {"User-Agent": "jeye-clock-widget/1.0"}
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()
            address = data.get("address", {})
            city = (
                address.get("city") or
                address.get("town") or
                address.get("village") or
                address.get("hamlet") or
                address.get("suburb") or
                address.get("county") or
                ""
            )
            reverse_geocode_cache[cache_key] = {
                "cached_at": datetime.now(timezone.utc),
                "city": city,
            }
            reverse_geocode_last_position = (lat, lon)
            return {"city": city}
        except Exception as exc:
            logger.error(f"Geocode error: {exc}")
            return {"city": ""}


@app.get("/api/weather")
async def get_weather(lat: float, lon: float, units: str = "metric"):
    global weather_last_position

    if not API_KEY:
        raise HTTPException(status_code=500, detail="API Key not configured")

    cache_key = _normalize_weather_key(lat, lon, units)
    now = datetime.now(timezone.utc)
    force_refresh = _should_force_location_refresh(
        lat, lon, weather_last_position, WEATHER_FORCE_REFRESH_DISTANCE_KM
    )

    # Fast path: return fresh cache without waiting for a lock.
    cached_entry = weather_cache.get(cache_key)
    if not force_refresh and cached_entry and _is_weather_cache_fresh(cached_entry["cached_at"], now):
        logger.info("Weather cache HIT for key=%s", cache_key)
        weather_last_position = (lat, lon)
        return _build_weather_response(cached_entry["data"], cached=True, cached_at=cached_entry["cached_at"])

    if force_refresh:
        logger.info(
            "Weather force refresh: moved > %.1f km from last position",
            WEATHER_FORCE_REFRESH_DISTANCE_KM,
        )

    # Slow path: synchronize refreshes for this cache key.
    lock = await _get_weather_lock(cache_key)
    async with lock:
        now = datetime.now(timezone.utc)
        force_refresh = _should_force_location_refresh(
            lat, lon, weather_last_position, WEATHER_FORCE_REFRESH_DISTANCE_KM
        )
        cached_entry = weather_cache.get(cache_key)
        if not force_refresh and cached_entry and _is_weather_cache_fresh(cached_entry["cached_at"], now):
            logger.info("Weather cache HIT-after-lock for key=%s", cache_key)
            weather_last_position = (lat, lon)
            return _build_weather_response(cached_entry["data"], cached=True, cached_at=cached_entry["cached_at"])

        logger.info("Weather cache MISS for key=%s; calling OpenWeather", cache_key)

        url = "https://api.openweathermap.org/data/4.0/onecall/current"
        params = {
            "lat": lat,
            "lon": lon,
            "appid": API_KEY,
            "units": units
        }

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                payload = resp.json()

            fetched_at = datetime.now(timezone.utc)
            weather_cache[cache_key] = {
                "cached_at": fetched_at,
                "data": payload,
            }
            weather_last_position = (lat, lon)
            return _build_weather_response(payload, cached=False, cached_at=fetched_at)
        except httpx.RequestError as exc:
            logger.error(f"An error occurred while requesting {exc.request.url!r}: {exc}")
            raise HTTPException(status_code=503, detail=f"Weather Service Unreachable: {exc}")
        except httpx.HTTPStatusError as exc:
            logger.error(f"Error response {exc.response.status_code} while requesting {exc.request.url!r}")
            raise HTTPException(status_code=exc.response.status_code, detail="Weather API Error")

class SQLQuery(BaseModel):
    query: str

@app.post("/api/query")
def execute_readonly_query(sql_query: SQLQuery, username: str = Depends(get_current_username)):
    """
    Executes a read-only SQL query against the database.
    """
    db_path = os.getenv("DB_PATH", "database.db")
    # Convert to URI
    # Use absolute path to ensure URI works correctly
    abs_path = os.path.abspath(db_path)
    # Create a read-only URI
    db_uri = Path(abs_path).as_uri() + "?mode=ro"

    try:
        # uri=True allows passing parameters like mode=ro
        with sqlite3.connect(db_uri, uri=True) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(sql_query.query)
            result = cursor.fetchall()
            return [dict(row) for row in result]
    except sqlite3.OperationalError as e:
        raise HTTPException(status_code=400, detail=f"Database error: {e}")
    except Exception as e:
        logger.error(f"Query execution failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# Mount static files
# Priority: ../frontend (Local dev), static/ (Docker)
if os.path.exists("../frontend"):
    static_dir = "../frontend"
elif os.path.exists("static"):
    static_dir = "static"
else:
    static_dir = None
    print("Warning: Static directory not found at ../frontend or static/")

if static_dir:
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
