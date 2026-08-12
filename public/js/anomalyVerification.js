// Anomaly Verification with Security Questions (Face Auth Disabled)
class AnomalyVerification {
  constructor() {
    this.currentAnomalyId = null;
    this.currentAnomalyIds = [];
    this.faceStream = null;
    this.verificationMethod = 'questions'; // Only security questions (face auth disabled)
  }

  // Initialize verification modal
  init() {
    this.createVerificationModal();
    this.bindEvents();
  }

  // Create the verification modal HTML
  createVerificationModal() {
    const modalHTML = `
      <div id="anomaly-verification-modal" class="modern-modal" style="display:none;">
        <div class="modern-modal-content">
          <span class="modern-modal-icon"><i class="bi bi-shield-exclamation"></i></span>
          <div class="modern-modal-title">Security Verification Required</div>
          <div class="modern-modal-subtitle">Please answer your security questions to proceed with this transaction</div>
          
          <!-- Method Selection (Face Auth Disabled) -->
          <div id="verification-method-selection" style="display:none;">
            <div class="verification-method-options">
              <button id="use-security-questions" class="method-btn active" disabled>
                <i class="bi bi-question-circle"></i>
                Security Questions
              </button>
              <button id="use-face-auth" class="method-btn" disabled style="opacity: 0.5;">
                <i class="bi bi-camera"></i>
                Face Authentication (Disabled)
              </button>
            </div>
          </div>

          <!-- Security Questions Section -->
          <div id="security-questions-section" class="verification-section">
            <div class="security-question">
              <label id="question1-label">Security Question 1</label>
              <input type="text" id="answer1" placeholder="Your answer" class="modern-modal-input">
            </div>
            <div class="security-question">
              <label id="question2-label">Security Question 2</label>
              <input type="text" id="answer2" placeholder="Your answer" class="modern-modal-input">
            </div>
            <div class="security-question">
              <label id="question3-label">Security Question 3</label>
              <input type="text" id="answer3" placeholder="Your answer" class="modern-modal-input">
            </div>
          </div>

          <!-- Face Authentication Section (Hidden) -->
          <div id="face-auth-section" class="verification-section" style="display:none;">
            <div class="face-camera-container">
              <video id="face-verification-video" width="320" height="240" autoplay muted style="border-radius:12px; background:#222; width:100%; max-width:320px;"></video>
              <canvas id="face-verification-canvas" style="display:none;"></canvas>
            </div>
            <div class="face-capture-info">
              <p>Position your face in the camera and click "Verify with Face"</p>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="verification-actions">
            <button id="verify-btn" class="modern-modal-btn">Verify Identity</button>
            <button id="cancel-verification-btn" class="modern-modal-btn-secondary">Cancel</button>
          </div>

          <!-- Error Display -->
          <div id="verification-error" style="color:#dc3545; font-size:0.95em; margin:10px 0; display:none;"></div>
        </div>
      </div>
    `;

    // Add modal to page if it doesn't exist
    if (!document.getElementById('anomaly-verification-modal')) {
      document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
  }

  // Bind event listeners
  bindEvents() {
    // Method selection (disabled but kept for future use)
    document.getElementById('use-security-questions').addEventListener('click', () => {
      this.switchMethod('questions');
    });

    document.getElementById('use-face-auth').addEventListener('click', () => {
      // Face auth is disabled - show message
      this.showError('Face authentication is currently disabled. Please use security questions.');
    });

    // Verification button
    document.getElementById('verify-btn').addEventListener('click', () => {
      this.performVerification();
    });

    // Cancel button
    document.getElementById('cancel-verification-btn').addEventListener('click', () => {
      this.closeModal();
    });

    // Close modal when clicking overlay
    document.addEventListener('click', (e) => {
      if (e.target.id === 'anomaly-verification-modal') {
        this.closeModal();
      }
    });
  }

  // Initialize face camera (kept for future use but not called)
  async initializeFaceCamera() {
    try {
      this.faceStream = await navigator.mediaDevices.getUserMedia({ video: true });
      document.getElementById('face-verification-video').srcObject = this.faceStream;
    } catch (error) {
      this.showError('Camera access denied. Please use security questions instead.');
      this.switchMethod('questions');
    }
  }

  // Stop face camera (kept for future use)
  stopFaceCamera() {
    if (this.faceStream) {
      this.faceStream.getTracks().forEach(track => track.stop());
      this.faceStream = null;
    }
    document.getElementById('face-verification-video').srcObject = null;
  }

  // Switch between verification methods (face auth disabled)
  switchMethod(method) {
    this.verificationMethod = method;
    
    // Only allow security questions
    if (method === 'face') {
      this.showError('Face authentication is currently disabled. Please use security questions.');
      return;
    }
    
    // Update button states
    document.querySelectorAll('.method-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`use-${method === 'questions' ? 'security-questions' : 'face-auth'}`).classList.add('active');
    
    // Show/hide sections
    document.getElementById('security-questions-section').style.display = method === 'questions' ? 'block' : 'none';
    document.getElementById('face-auth-section').style.display = method === 'face' ? 'block' : 'none';
    
    // Update button text
    const verifyBtn = document.getElementById('verify-btn');
    verifyBtn.textContent = method === 'questions' ? 'Verify with Questions' : 'Verify with Face';
    
    // Initialize face camera if switching to face (disabled)
    if (method === 'face') {
      this.initializeFaceCamera();
    } else {
      this.stopFaceCamera();
    }
  }

  // Show verification modal
  showModal(anomalyId = null, anomalyIds = [], action = 'authorize') {
    this.currentAnomalyId = anomalyId;
    this.currentAnomalyIds = anomalyIds;
    this.currentAction = action;
    
    // Load security questions
    this.loadSecurityQuestions();
    
    // Show modal
    document.getElementById('anomaly-verification-modal').style.display = 'block';
    document.getElementById('verification-error').style.display = 'none';
    
    // Force security questions method (face auth disabled)
    this.verificationMethod = 'questions';
  }

  // Load security questions
  async loadSecurityQuestions() {
    try {
      const response = await fetch('/security-questions');
      const data = await response.json();
      
      if (data.success && data.questions) {
        document.getElementById('question1-label').textContent = data.questions[0]?.question_text || 'Security Question 1';
        document.getElementById('question2-label').textContent = data.questions[1]?.question_text || 'Security Question 2';
        document.getElementById('question3-label').textContent = data.questions[2]?.question_text || 'Security Question 3';
      }
    } catch (error) {
      console.error('Error loading security questions:', error);
    }
  }

  // Check if user has face authentication enabled (disabled)
  async checkFaceAuthStatus() {
    // Face auth is disabled - always return false
    return false;
  }

  // Perform verification (only security questions)
  async performVerification() {
    const verifyBtn = document.getElementById('verify-btn');
    const originalText = verifyBtn.textContent;
    
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';
    this.hideError();

    try {
      let requestBody = {
        action: this.currentAction || 'authorize'
      };

      // Handle anomaly IDs properly
      if (this.currentAnomalyIds && this.currentAnomalyIds.length > 0) {
        requestBody.anomalyIds = this.currentAnomalyIds;
      }

      // Add transaction data if available
      if (this.transactionData) {
        requestBody.transactionData = this.transactionData;
      }

      // Add transaction type if available
      if (this.transactionType) {
        requestBody.transactionType = this.transactionType;
      }

      // Only use security questions (face auth disabled)
      const answers = [
        document.getElementById('answer1').value,
        document.getElementById('answer2').value,
        document.getElementById('answer3').value
      ].filter(answer => answer.trim() !== '');
      
      if (answers.length < 2) {
        this.showError('Please answer at least 2 security questions.');
        return;
      }
      
      requestBody.answers = answers;

      // Send verification request
      const response = await fetch('/verify-anomaly', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (data.success) {
        this.showSuccess(data.message);
        setTimeout(() => {
          this.closeModal();
          
          // If this is for a deposit transaction, proceed to Paystack
          if (this.transactionType === 'deposit' && this.transactionData) {
            // Check if we should proceed to payment
            if (data.proceedToPayment) {
              // Call the Paystack function directly with user email
              if (typeof payWithPaystack === 'function') {
                const userEmail = this.transactionData.userEmail;
                payWithPaystack(userEmail);
              } else {
                // Fallback: reload page
                window.location.reload();
              }
            } else {
              // For other transactions, reload page
              window.location.reload();
            }
          } else {
            // For other transactions, reload page
            window.location.reload();
          }
        }, 1500);
      } else {
        this.showError(data.message || 'Verification failed. Please try again.');
      }
    } catch (error) {
      console.error('Verification error:', error);
      this.showError('Network error. Please check your connection and try again.');
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = originalText;
    }
  }

  // Close modal
  closeModal() {
    this.stopFaceCamera();
    document.getElementById('anomaly-verification-modal').style.display = 'none';
    this.hideError();
    
    // Clear form
    document.getElementById('answer1').value = '';
    document.getElementById('answer2').value = '';
    document.getElementById('answer3').value = '';
  }

  // Show error message
  showError(message) {
    const errorDiv = document.getElementById('verification-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  // Hide error message
  hideError() {
    document.getElementById('verification-error').style.display = 'none';
  }

  // Show success message
  showSuccess(message) {
    const errorDiv = document.getElementById('verification-error');
    errorDiv.style.color = '#10b981';
    errorDiv.textContent = `✅ ${message}`;
    errorDiv.style.display = 'block';
  }

  // Show modal with transaction data (called from Paystack scripts)
  showModal(anomalies, transactionType, transactionData) {
    // Extract anomaly IDs from the anomalies array
    this.currentAnomalyIds = anomalies.map(anomaly => anomaly.anomaly_id).filter(id => id);
    this.currentAction = 'authorize'; // Always authorize for transactions
    this.transactionData = transactionData;
    this.transactionType = transactionType;
    
    // Load security questions
    this.loadSecurityQuestions();
    
    // Show the modal
    document.getElementById('anomaly-verification-modal').style.display = 'flex';
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  window.anomalyVerification = new AnomalyVerification();
  window.anomalyVerification.init();
});

// Global function to trigger verification
window.triggerAnomalyVerification = function(anomalyId = null, anomalyIds = [], action = 'authorize') {
  window.anomalyVerification.showModal(anomalyId, anomalyIds, action);
}; 