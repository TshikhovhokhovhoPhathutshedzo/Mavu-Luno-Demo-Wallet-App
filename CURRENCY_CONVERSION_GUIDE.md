# Currency Conversion Pattern Guide

## Overview
This document explains the consistent currency handling pattern used throughout the Luno Wallet application to ensure precision and avoid floating-point errors in financial calculations.

## Core Pattern

### 1. User Input
- **Format**: Amounts in Rands (ZAR) with decimal places
- **Example**: `123.45` (R 123.45)

### 2. Database Storage
- **Format**: Amounts stored as `BIGINT` in cents (smallest currency unit)
- **Example**: `12345` cents (equivalent to R 123.45)

### 3. Internal Calculations
- **Format**: All mathematical operations performed in cents
- **Benefit**: Avoids floating-point precision errors
- **Example**: 
  ```javascript
  const amountInCents = Math.round(amountInRands * 100); // Convert to cents
  const newBalance = currentBalance - BigInt(amountInCents); // Calculate in cents
  ```

### 4. Display & Email Formatting
- **Format**: Convert back to Rands by dividing by 100
- **Example**: 
  ```javascript
  const displayAmount = (amountInCents / 100).toFixed(2); // "123.45"
  ```

## Implementation Examples

### Withdrawal Processing
```javascript
// User input: 123.45 (Rands)
const withdrawAmountRands = parseFloat(amount);
const withdrawAmountCents = Math.round(withdrawAmountRands * 100); // 12345 cents

// Database storage: 12345 (cents)
// Email display: R 123.45
```

### Payment Processing
```javascript
// User input: 50.00 (Rands)
const paymentAmount = parseFloat(amount);
const paymentAmountCents = Math.round(paymentAmount * 100); // 5000 cents

// Balance calculations in cents
const newBalance = currentBalance - BigInt(paymentAmountCents);
```

### Transaction Display
```javascript
// Database value: 12345 (cents)
const displayAmount = (12345 / 100).toFixed(2); // "123.45"
```

## Database Schema

### Transaction Tables
- `transaction_history.amount`: `BIGINT` (cents)
- `transaction_movements.amount`: `BIGINT` (cents)
- `transaction_movements.balance_after`: `BIGINT` (cents)

### Payment Tables
- `payment_verification.amount`: `NUMERIC` (Rands) - for user readability
- `payment_history.amount`: `NUMERIC` (Rands) - for user readability

## Benefits

1. **Precision**: No floating-point errors in calculations
2. **Consistency**: Uniform handling across all financial operations
3. **Performance**: Integer operations are faster than floating-point
4. **Accuracy**: Eliminates rounding errors in financial calculations

## Best Practices

1. **Always convert user input to cents** before storage or calculations
2. **Use BigInt for balance calculations** to handle large numbers
3. **Format for display only** when showing amounts to users
4. **Document conversion patterns** in code comments
5. **Maintain consistency** across all financial modules

## Common Functions

### Conversion Functions
```javascript
// Convert Rands to cents
function randsToCents(rands) {
    return Math.round(parseFloat(rands) * 100);
}

// Convert cents to Rands
function centsToRands(cents) {
    return (Number(cents) / 100).toFixed(2);
}

// Format Rands for display
function formatRands(amount) {
    return `R ${(Number(amount) / 100).toFixed(2)}`;
}
```

## Error Handling

Always validate user input:
```javascript
if (isNaN(withdrawAmountRands) || withdrawAmountRands <= 0) {
    return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount. Please enter a positive number.' 
    });
}
```

## Testing

Test conversion functions thoroughly:
```javascript
// Test cases
console.log(randsToCents(123.45)); // 12345
console.log(centsToRands(12345));  // "123.45"
console.log(formatRands(12345));   // "R 123.45"
```

This pattern ensures financial accuracy and consistency throughout the Luno Wallet application.
