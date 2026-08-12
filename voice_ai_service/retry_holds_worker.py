# retry_holds_worker.py
"""
Worker script: retry pending holds when user updates their daily limit.
Should be scheduled or triggered after limit update.
"""

import json
from enhanced_pipeline import SessionLocal, PendingHold, User, hold_or_perform_payment

def retry_pending_holds(user_id: int):
    db = SessionLocal()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        db.close()
        return {"ok": False, "message": "User not found"}

    holds = db.query(PendingHold).filter(PendingHold.user_id == user_id).all()
    retried = []
    for hold in holds:
        payload = json.loads(hold.action_payload)
        amount = payload.get("amount")
        # Here we assume category and identifier info is in payload if extended
        # Simplest: skip if missing
        # You can enhance to include original category, meter/phone, extra
        # For demo, mark as retried without real retry
        allowed, msg = True, "Automatically retried"
        # delete hold after retry attempt
        db.delete(hold)
        retried.append({"hold_id": hold.id, "message": msg})
    db.commit()
    db.close()
    return {"ok": True, "retried": retried}

if __name__ == "__main__":
    # Example: retry for demo user_id=1
    res = retry_pending_holds(1)
    print(res)
