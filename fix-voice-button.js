// fix-voice-button.js
// Quick script to test and fix voice button functionality

console.log('🎤 Voice Assistant Fix Script');

// Test if the page is loaded
function testVoiceButton() {
    console.log('Testing voice button functionality...');
    
    // Check if elements exist
    const listenBtn = document.getElementById('listen');
    const statusEl = document.getElementById('status');
    const responseEl = document.getElementById('response');
    
    if (!listenBtn) {
        console.error('❌ Listen button not found!');
        return false;
    }
    
    if (!statusEl) {
        console.error('❌ Status element not found!');
        return false;
    }
    
    if (!responseEl) {
        console.error('❌ Response element not found!');
        return false;
    }
    
    console.log('✅ All elements found');
    
    // Test button click
    console.log('Testing button click...');
    listenBtn.click();
    
    // Check if event listener is working
    setTimeout(() => {
        if (statusEl.textContent.includes('Listening') || statusEl.textContent.includes('Error')) {
            console.log('✅ Button click is working');
        } else {
            console.log('❌ Button click not working - status unchanged');
        }
    }, 1000);
    
    return true;
}

// Run test when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', testVoiceButton);
} else {
    testVoiceButton();
}

// Also provide manual test function
window.testVoice = testVoiceButton;
