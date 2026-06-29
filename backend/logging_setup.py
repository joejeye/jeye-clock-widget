import json
import logging
import os
import sqlite3
import sys
import threading
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
from logging.handlers import QueueHandler, QueueListener
from queue import Full, Queue
from typing import Any, Dict, Optional, Tuple

# Request-scoped context for HTTP logs.
request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
request_method_ctx: ContextVar[Optional[str]] = ContextVar("request_method", default=None)
request_path_ctx: ContextVar[Optional[str]] = ContextVar("request_path", default=None)

# LogRecord standard attributes; everything else is treated as structured extra context.
STANDARD_RECORD_ATTRS = {
    "args", "asctime", "created", "exc_info", "exc_text", "filename", "funcName",
    "levelname", "levelno", "lineno", "module", "msecs", "message", "msg", "name",
    "pathname", "process", "processName", "relativeCreated", "stack_info", "thread", "threadName",
    "taskName", "request_id", "method", "path", "event", "status_code", "latency_ms", "context",
}


@dataclass
class LoggingRuntime:
    queue_handler: "NonBlockingQueueHandler"
    sqlite_handler: "SQLiteBatchHandler"
    listener: QueueListener


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_ctx.get()
        if not hasattr(record, "method"):
            record.method = request_method_ctx.get()
        if not hasattr(record, "path"):
            record.path = request_path_ctx.get()
        return True


class NonBlockingQueueHandler(QueueHandler):
    """QueueHandler that never blocks request threads."""

    def __init__(self, q: Queue):
        super().__init__(q)
        self._dropped = 0
        self._lock = threading.Lock()

    def enqueue(self, record: logging.LogRecord) -> None:
        try:
            self.queue.put_nowait(record)
        except Full:
            with self._lock:
                self._dropped += 1
                dropped = self._dropped
            # Avoid recursive logging if queue is saturated.
            if dropped % 100 == 0:
                print(
                    f"[sqlite-logger] dropped {dropped} log records because queue is full",
                    file=sys.stderr,
                )


class SQLiteBatchHandler(logging.Handler):
    """Writes logs to SQLite from the QueueListener thread."""

    def __init__(self, db_path: str, batch_size: int = 50, flush_interval_seconds: float = 1.0):
        super().__init__()
        self.db_path = db_path
        self.batch_size = batch_size
        self.flush_interval_seconds = flush_interval_seconds
        self._conn: Optional[sqlite3.Connection] = None
        self._buffer: list[tuple] = []
        self._last_flush_ts = datetime.now(timezone.utc).timestamp()

        self._open()
        self._initialize_schema()

    def _open(self) -> None:
        parent = os.path.dirname(self.db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)

        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute("PRAGMA synchronous=NORMAL;")
        self._conn.execute("PRAGMA busy_timeout=5000;")

    def _initialize_schema(self) -> None:
        assert self._conn is not None
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS app_logs (
              id            INTEGER PRIMARY KEY AUTOINCREMENT,
              ts_utc        TEXT NOT NULL,
              ts_unix_ms    INTEGER NOT NULL,
              level         TEXT NOT NULL CHECK(level IN ('DEBUG','INFO','WARNING','ERROR','CRITICAL')),
              logger        TEXT NOT NULL,
              event         TEXT NOT NULL,
              message       TEXT NOT NULL,
              request_id    TEXT,
              method        TEXT,
              path          TEXT,
              status_code   INTEGER,
              latency_ms    INTEGER,
              module        TEXT,
              func          TEXT,
              line          INTEGER,
              exception     TEXT,
              context_json  TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_app_logs_ts_unix_ms ON app_logs(ts_unix_ms);
            CREATE INDEX IF NOT EXISTS idx_app_logs_level      ON app_logs(level);
            CREATE INDEX IF NOT EXISTS idx_app_logs_event      ON app_logs(event);
            CREATE INDEX IF NOT EXISTS idx_app_logs_request_id ON app_logs(request_id);
            CREATE INDEX IF NOT EXISTS idx_app_logs_path_ts    ON app_logs(path, ts_unix_ms);
            CREATE INDEX IF NOT EXISTS idx_app_logs_status_ts  ON app_logs(status_code, ts_unix_ms);
            """
        )
        self._conn.commit()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._buffer.append(self._record_to_row(record))
            now_ts = datetime.now(timezone.utc).timestamp()
            should_flush = (
                len(self._buffer) >= self.batch_size
                or (now_ts - self._last_flush_ts) >= self.flush_interval_seconds
            )
            if should_flush:
                self.flush()
        except Exception:
            self.handleError(record)

    def _record_to_row(self, record: logging.LogRecord) -> tuple:
        ts_utc = datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(timespec="milliseconds")
        ts_unix_ms = int(record.created * 1000)

        event = getattr(record, "event", "app_log")
        message = record.getMessage()
        exc_text = None
        if record.exc_info:
            exc_text = logging.Formatter().formatException(record.exc_info)

        explicit_context = getattr(record, "context", None)
        if explicit_context is not None and not isinstance(explicit_context, dict):
            explicit_context = {"context": str(explicit_context)}

        extra_context: Dict[str, Any] = explicit_context or {}
        for key, value in record.__dict__.items():
            if key not in STANDARD_RECORD_ATTRS and not key.startswith("_"):
                extra_context[key] = value

        context_json = json.dumps(extra_context, default=str) if extra_context else None

        return (
            ts_utc,
            ts_unix_ms,
            record.levelname,
            record.name,
            str(event),
            message,
            getattr(record, "request_id", None),
            getattr(record, "method", None),
            getattr(record, "path", None),
            getattr(record, "status_code", None),
            getattr(record, "latency_ms", None),
            record.module,
            record.funcName,
            record.lineno,
            exc_text,
            context_json,
        )

    def flush(self) -> None:
        if not self._buffer:
            return
        assert self._conn is not None
        self._conn.executemany(
            """
            INSERT INTO app_logs (
                ts_utc, ts_unix_ms, level, logger, event, message,
                request_id, method, path, status_code, latency_ms,
                module, func, line, exception, context_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            self._buffer,
        )
        self._conn.commit()
        self._buffer.clear()
        self._last_flush_ts = datetime.now(timezone.utc).timestamp()

    def close(self) -> None:
        try:
            self.flush()
        finally:
            if self._conn is not None:
                self._conn.close()
                self._conn = None
        super().close()


def set_request_context(request_id: str, method: str, path: str) -> Tuple[Any, Any, Any]:
    token_id = request_id_ctx.set(request_id)
    token_method = request_method_ctx.set(method)
    token_path = request_path_ctx.set(path)
    return token_id, token_method, token_path


def reset_request_context(tokens: Tuple[Any, Any, Any]) -> None:
    token_id, token_method, token_path = tokens
    request_id_ctx.reset(token_id)
    request_method_ctx.reset(token_method)
    request_path_ctx.reset(token_path)


def setup_sqlite_queue_logging(
    db_path: str,
    level: str = "INFO",
    queue_maxsize: int = 10_000,
    batch_size: int = 50,
    flush_interval_seconds: float = 1.0,
) -> LoggingRuntime:
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    log_queue: Queue = Queue(maxsize=queue_maxsize)

    queue_handler = NonBlockingQueueHandler(log_queue)
    queue_handler.setLevel(getattr(logging, level.upper(), logging.INFO))
    queue_handler.addFilter(RequestContextFilter())

    sqlite_handler = SQLiteBatchHandler(
        db_path=db_path,
        batch_size=batch_size,
        flush_interval_seconds=flush_interval_seconds,
    )
    sqlite_handler.setLevel(getattr(logging, level.upper(), logging.INFO))

    listener = QueueListener(log_queue, sqlite_handler, respect_handler_level=True)
    listener.start()

    root.addHandler(queue_handler)

    return LoggingRuntime(
        queue_handler=queue_handler,
        sqlite_handler=sqlite_handler,
        listener=listener,
    )


def shutdown_sqlite_queue_logging(runtime: Optional[LoggingRuntime]) -> None:
    if runtime is None:
        return

    root = logging.getLogger()
    root.removeHandler(runtime.queue_handler)

    runtime.listener.stop()
    runtime.sqlite_handler.close()
    runtime.queue_handler.close()
