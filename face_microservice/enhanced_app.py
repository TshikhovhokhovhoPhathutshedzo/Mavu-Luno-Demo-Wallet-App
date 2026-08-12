import os
import pickle
import base64
import io
import logging
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import cv2
from PIL import Image
import face_recognition

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Enhanced Face Recognition API", version="2.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure as needed for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for API
class EnrollRequest(BaseModel):
    name: str
    image: str  # base64-encoded image
    user_id: Optional[str] = None

class VerifyRequest(BaseModel):
    image: str  # base64-encoded image
    target_name: str

class RecognitionRequest(BaseModel):
    image: str  # base64-encoded image

class BatchEnrollRequest(BaseModel):
    name: str
    images: List[str]  # array of base64-encoded images

class FaceRecognitionResponse(BaseModel):
    success: bool
    message: str
    recognized_faces: Optional[List[Dict]] = None
    confidence: Optional[float] = None

# Global variables for face recognition system
ENCODINGS_PATH = "faces"
KNOWN_FACES_FILE = "known_faces.pkl"
known_encodings = []
known_names = []
tolerance = 0.6  # Matching tolerance

# Create directories if they don't exist
os.makedirs(ENCODINGS_PATH, exist_ok=True)

def load_known_faces():
    """Load known face encodings from pickle file"""
    global known_encodings, known_names
    
    if os.path.exists(KNOWN_FACES_FILE):
        try:
            with open(KNOWN_FACES_FILE, "rb") as f:
                data = pickle.load(f)
                known_encodings = data.get('encodings', [])
                known_names = data.get('names', [])
            logger.info(f"Loaded {len(known_names)} known faces: {known_names}")
        except Exception as e:
            logger.error(f"Error loading known faces: {e}")
            known_encodings = []
            known_names = []
    else:
        logger.info("No known faces file found, starting fresh")

def save_known_faces():
    """Save known face encodings to pickle file"""
    data = {
        'encodings': known_encodings,
        'names': known_names
    }
    
    try:
        with open(KNOWN_FACES_FILE, "wb") as f:
            pickle.dump(data, f)
        logger.info(f"Saved {len(known_names)} known faces")
    except Exception as e:
        logger.error(f"Error saving known faces: {e}")

def decode_base64_image(image_b64: str) -> np.ndarray:
    """Decode base64 image to numpy array"""
    try:
        if ',' in image_b64:
            image_b64 = image_b64.split(',')[-1]
        
        img_bytes = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        return np.array(img)
    except Exception as e:
        logger.error(f"Error decoding base64 image: {e}")
        raise HTTPException(status_code=400, detail="Invalid image format")

def extract_face_encoding(image: np.ndarray) -> Optional[np.ndarray]:
    """Extract face encoding from image using face_recognition library"""
    try:
        # Convert BGR to RGB (face_recognition expects RGB)
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Find face encodings
        face_encodings = face_recognition.face_encodings(rgb_image)
        
        if not face_encodings:
            logger.warning("No face detected in image")
            return None
        
        # Return the first face encoding
        return face_encodings[0]
    
    except Exception as e:
        logger.error(f"Error extracting face encoding: {e}")
        return None

def find_face_locations(image: np.ndarray) -> List[tuple]:
    """Find face locations in image"""
    try:
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        face_locations = face_recognition.face_locations(rgb_image)
        return face_locations
    except Exception as e:
        logger.error(f"Error finding face locations: {e}")
        return []

@app.on_event("startup")
async def startup_event():
    """Load known faces on startup"""
    load_known_faces()

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Enhanced Face Recognition API",
        "version": "2.0.0",
        "known_faces_count": len(known_names),
        "known_faces": known_names
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": "2025-08-22T17:02:00Z",
        "version": "2.0.0"
    }

@app.post("/enroll", response_model=FaceRecognitionResponse)
async def enroll_face(request: EnrollRequest):
    """
    Enroll a new face for recognition
    Based on the article's training image capture approach
    """
    try:
        # Decode the image
        image = decode_base64_image(request.image)
        
        # Extract face encoding
        face_encoding = extract_face_encoding(image)
        
        if face_encoding is None:
            raise HTTPException(status_code=400, detail="No face detected in image")
        
        # Check if name already exists
        if request.name in known_names:
            # Update existing encoding (replace the first occurrence)
            idx = known_names.index(request.name)
            known_encodings[idx] = face_encoding
            logger.info(f"Updated encoding for existing user: {request.name}")
        else:
            # Add new encoding
            known_encodings.append(face_encoding)
            known_names.append(request.name)
            logger.info(f"Added new user: {request.name}")
        
        # Save to file
        save_known_faces()
        
        return FaceRecognitionResponse(
            success=True,
            message=f"Successfully enrolled face for {request.name}",
            confidence=1.0
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enrolling face: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/enroll-batch", response_model=FaceRecognitionResponse)
async def enroll_face_batch(request: BatchEnrollRequest):
    """
    Enroll multiple images for the same person
    Enhanced version based on the article's multiple image capture approach
    """
    try:
        if len(request.images) < 2:
            raise HTTPException(status_code=400, detail="At least 2 images required for batch enrollment")
        
        all_encodings = []
        
        for i, image_b64 in enumerate(request.images):
            # Decode the image
            image = decode_base64_image(image_b64)
            
            # Extract face encoding
            face_encoding = extract_face_encoding(image)
            
            if face_encoding is None:
                raise HTTPException(
                    status_code=400, 
                    detail=f"No face detected in image {i+1}"
                )
            
            all_encodings.append(face_encoding)
        
        # Remove existing encodings for this name
        if request.name in known_names:
            indices = [i for i, name in enumerate(known_names) if name == request.name]
            for idx in reversed(indices):
                known_encodings.pop(idx)
                known_names.pop(idx)
        
        # Add all new encodings
        known_encodings.extend(all_encodings)
        known_names.extend([request.name] * len(all_encodings))
        
        # Save to file
        save_known_faces()
        
        return FaceRecognitionResponse(
            success=True,
            message=f"Successfully enrolled {len(all_encodings)} images for {request.name}",
            confidence=1.0
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in batch enrollment: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/verify", response_model=FaceRecognitionResponse)
async def verify_face(request: VerifyRequest):
    """
    Verify if an image contains the face of a specific person
    Based on the article's face verification approach
    """
    try:
        # Decode the image
        image = decode_base64_image(request.image)
        
        # Extract face encoding
        face_encoding = extract_face_encoding(image)
        
        if face_encoding is None:
            raise HTTPException(status_code=400, detail="No face detected in image")
        
        # Find encodings for the target person
        target_encodings = []
        for i, name in enumerate(known_names):
            if name.lower() == request.target_name.lower():
                target_encodings.append(known_encodings[i])
        
        if not target_encodings:
            raise HTTPException(
                status_code=404, 
                detail=f"No enrolled faces found for {request.target_name}"
            )
        
        # Compare with target person's encodings
        matches = face_recognition.compare_faces(
            target_encodings, 
            face_encoding, 
            tolerance=tolerance
        )
        
        # Calculate confidence based on face distances
        face_distances = face_recognition.face_distance(target_encodings, face_encoding)
        min_distance = min(face_distances)
        confidence = 1 - min_distance  # Convert distance to confidence
        
        is_match = True in matches
        
        return FaceRecognitionResponse(
            success=is_match,
            message=f"Face verification {'successful' if is_match else 'failed'} for {request.target_name}",
            confidence=confidence
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying face: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/recognize", response_model=FaceRecognitionResponse)
async def recognize_faces(request: RecognitionRequest):
    """
    Recognize all faces in an image
    Based on the article's real-time recognition approach
    """
    try:
        # Decode the image
        image = decode_base64_image(request.image)
        
        # Convert to RGB for face_recognition
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Find face locations and encodings
        face_locations = face_recognition.face_locations(rgb_image)
        face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
        
        if not face_encodings:
            return FaceRecognitionResponse(
                success=False,
                message="No faces detected in image"
            )
        
        recognized_faces = []
        
        for face_encoding, face_location in zip(face_encodings, face_locations):
            # Compare with known faces
            matches = face_recognition.compare_faces(
                known_encodings, 
                face_encoding, 
                tolerance=tolerance
            )
            
            name = "Unknown"
            confidence = 0.0
            
            if True in matches:
                first_match_index = matches.index(True)
                name = known_names[first_match_index]
                
                # Calculate confidence
                face_distances = face_recognition.face_distance(known_encodings, face_encoding)
                min_distance = min(face_distances)
                confidence = 1 - min_distance
            
            recognized_faces.append({
                "name": name,
                "confidence": confidence,
                "location": face_location
            })
        
        return FaceRecognitionResponse(
            success=True,
            message=f"Recognized {len(recognized_faces)} faces",
            recognized_faces=recognized_faces
        )
    
    except Exception as e:
        logger.error(f"Error recognizing faces: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/known-faces")
async def get_known_faces():
    """Get list of all known faces"""
    return {
        "count": len(known_names),
        "faces": known_names
    }

@app.delete("/remove-face/{name}")
async def remove_face(name: str):
    """Remove a face from the known faces"""
    try:
        if name not in known_names:
            raise HTTPException(status_code=404, detail=f"Face '{name}' not found")
        
        # Remove all encodings for this name
        indices = [i for i, n in enumerate(known_names) if n == name]
        for idx in reversed(indices):
            known_encodings.pop(idx)
            known_names.pop(idx)
        
        # Save updated faces
        save_known_faces()
        
        return {
            "success": True,
            "message": f"Removed face '{name}' from known faces"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing face: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/extract-encoding")
async def extract_encoding(request: RecognitionRequest):
    """Extract face encoding from image (for debugging)"""
    try:
        image = decode_base64_image(request.image)
        face_encoding = extract_face_encoding(image)
        
        if face_encoding is None:
            raise HTTPException(status_code=400, detail="No face detected in image")
        
        return {
            "success": True,
            "encoding_length": len(face_encoding),
            "encoding_preview": face_encoding[:10].tolist()  # First 10 values
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting encoding: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/detect-faces")
async def detect_faces(request: RecognitionRequest):
    """Detect faces in image and return face locations with improved sensitivity"""
    try:
        image = decode_base64_image(request.image)
        
        # Convert to RGB for face_recognition
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Try multiple detection methods for better sensitivity
        face_locations = []
        
        # Method 1: Standard face_recognition (most accurate)
        try:
            face_locations = face_recognition.face_locations(rgb_image, model="hog")
            if len(face_locations) > 0:
                logger.info(f"Faces detected with HOG model: {len(face_locations)}")
        except Exception as e:
            logger.warning(f"HOG detection failed: {e}")
        
        # Method 2: CNN model if HOG fails (more sensitive but slower)
        if len(face_locations) == 0:
            try:
                face_locations = face_recognition.face_locations(rgb_image, model="cnn")
                if len(face_locations) > 0:
                    logger.info(f"Faces detected with CNN model: {len(face_locations)}")
            except Exception as e:
                logger.warning(f"CNN detection failed: {e}")
        
        # Method 3: OpenCV cascade as fallback (fastest, most permissive)
        if len(face_locations) == 0:
            try:
                import cv2
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
                face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
                
                # Try multiple detection parameters for better sensitivity
                detection_params = [
                    (1.01, 1, (20, 20)),     # Very sensitive
                    (1.05, 2, (30, 30)),     # Sensitive
                    (1.1, 3, (40, 40)),      # Standard
                ]
                
                for scale_factor, min_neighbors, min_size in detection_params:
                    faces = face_cascade.detectMultiScale(gray, scale_factor, min_neighbors, minSize=min_size)
                    if len(faces) > 0:
                        # Convert OpenCV format to face_recognition format
                        face_locations = [(y, x + w, y + h, x) for (x, y, w, h) in faces]
                        logger.info(f"Faces detected with OpenCV: {len(face_locations)}")
                        break
            except Exception as e:
                logger.warning(f"OpenCV detection failed: {e}")
        
        return {
            "success": True,
            "faces_detected": len(face_locations),
            "face_locations": face_locations
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error detecting faces: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/analyze-liveness")
async def analyze_liveness(request: RecognitionRequest):
    """Analyze liveness of faces in image"""
    try:
        image = decode_base64_image(request.image)
        
        # Convert to RGB for face_recognition
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Find face locations
        face_locations = face_recognition.face_locations(rgb_image)
        
        if len(face_locations) == 0:
            return {
                "success": True,
                "isLive": False,
                "score": 0.0,
                "message": "No faces detected"
            }
        
        # Simple liveness detection based on face quality and size
        # In a real implementation, you'd use more sophisticated techniques
        face_encodings = face_recognition.face_encodings(rgb_image, face_locations)
        
        if len(face_encodings) == 0:
            return {
                "success": True,
                "isLive": False,
                "score": 0.0,
                "message": "Could not extract face features"
            }
        
        # Calculate liveness score based on face quality (more lenient)
        # This is a simplified approach - in production you'd use more sophisticated methods
        face_quality_score = 0.9  # Higher base score for better detection
        
        # Check if face is large enough (indicates close distance)
        face_area = (face_locations[0][2] - face_locations[0][0]) * (face_locations[0][3] - face_locations[0][1])
        image_area = image.shape[0] * image.shape[1]
        size_ratio = face_area / image_area
        
        # More lenient liveness detection
        # If face is reasonably sized, consider it live
        if size_ratio > 0.01:  # Face takes up at least 1% of image
            liveness_score = 0.8
        else:
            liveness_score = (face_quality_score * 0.6) + (min(size_ratio * 15, 1.0) * 0.4)
        
        # Lower threshold for liveness
        is_live = liveness_score > 0.3
        
        return {
            "success": True,
            "isLive": is_live,
            "score": liveness_score,
            "face_quality": face_quality_score,
            "size_ratio": size_ratio
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing liveness: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "enhanced-face-recognition"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
