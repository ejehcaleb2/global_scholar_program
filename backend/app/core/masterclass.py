from datetime import datetime, timezone


def is_masterclass_past(session_datetime: datetime) -> bool:
    if session_datetime.tzinfo is None:
        session_datetime = session_datetime.replace(tzinfo=timezone.utc)
    return session_datetime < datetime.now(timezone.utc)
