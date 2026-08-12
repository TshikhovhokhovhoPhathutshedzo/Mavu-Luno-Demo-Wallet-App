# tests/test_voice_assistant.py
import pytest
from enhanced_pipeline import (
    is_valid_sa_phone, is_valid_electricity_meter, is_valid_water_meter,
    User, SessionLocal, check_and_apply_daily_limit
)

def test_phone_validation():
    assert is_valid_sa_phone("0712345678")
    assert is_valid_sa_phone("+27712345678")
    assert not is_valid_sa_phone("012345")
    assert not is_valid_sa_phone("1234567890")

def test_meter_validation():
    assert is_valid_electricity_meter("1234567890")
    assert not is_valid_electricity_meter("12345")
    assert is_valid_water_meter("12345")
    assert not is_valid_water_meter("1234")

def test_daily_limit_enforcement():
    db = SessionLocal()
    user = User(email="test_limit@example.com", balance=1000.0, daily_limit=100.0)
    db.add(user)
    db.commit()
    db.refresh(user)
    allowed, msg = check_and_apply_daily_limit(user, 50.0, db)
    assert allowed
    allowed, msg = check_and_apply_daily_limit(user, 60.0, db)
    assert not allowed
    db.delete(user)
    db.commit()
    db.close()
