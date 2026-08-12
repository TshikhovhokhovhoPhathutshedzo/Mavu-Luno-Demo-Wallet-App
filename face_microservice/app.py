#!/usr/bin/env python3
"""
Face Recognition Microservice
This is a simple wrapper that imports and runs the enhanced_app.py
"""

import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the enhanced app
from enhanced_app import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)

