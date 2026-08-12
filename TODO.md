# Deposit and Withdrawal Testing & Fixes

## Current Issues Identified
- Balance display inconsistency between accounts table and transaction_movements
- Potential currency conversion issues (cents vs rands)
- Daily limits middleware implementation needs verification
- Paystack integration flow needs testing
- Real-time balance updates in frontend

## Testing Plan

### 1. Backend API Testing
- [ ] Test `/api/verify-deposit` endpoint with Paystack reference
- [ ] Test `/api/withdraw` endpoint with amount validation
- [ ] Test `/api/check-deposit-limits` and `/api/check-withdrawal-limits`
- [ ] Test `/api/check-anomalies` for deposit anomaly detection
- [ ] Verify balance updates in both accounts and transaction_movements tables
- [ ] Test currency conversion (cents to rands) consistency

### 2. Frontend Modal Testing
- [ ] Test deposit modal form submission
- [ ] Test withdrawal modal form submission
- [ ] Test Paystack integration and callback handling
- [ ] Test real-time balance updates after transactions
- [ ] Test error message display for validation failures

### 3. Database Consistency Testing
- [ ] Verify transaction_movements table updates correctly
- [ ] Check accounts table balance updates
- [ ] Ensure transaction records are created properly
- [ ] Test rollback behavior on transaction failures

### 4. Security & Validation Testing
- [ ] Test daily limits enforcement
- [ ] Test anomaly detection integration
- [ ] Test biometric verification (if enabled)
- [ ] Test security questions requirement

### 5. Integration Testing
- [ ] End-to-end deposit flow (modal → Paystack → backend verification → balance update)
- [ ] End-to-end withdrawal flow (modal → validation → processing → balance update)
- [ ] Test concurrent transactions (race conditions)
- [ ] Test network failure scenarios

## Fixes to Implement

### Critical Fixes
- [ ] Fix balance display inconsistency in homeController.js
- [ ] Ensure currency conversion consistency across all endpoints
- [ ] Fix any issues with daily limits middleware
- [ ] Improve error handling and user feedback

### Performance & UX Improvements
- [ ] Add loading states during transaction processing
- [ ] Improve error messages for better user understanding
- [ ] Add transaction confirmation dialogs
- [ ] Implement proper form validation feedback

## Testing Status
- [ ] Backend API tests: Not started
- [ ] Frontend modal tests: Not started
- [ ] Database consistency tests: Not started
- [ ] Security validation tests: Not started
- [ ] Integration tests: Not started
