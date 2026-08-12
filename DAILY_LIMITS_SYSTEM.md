# Daily Limits System Documentation

## Overview

The Daily Limits System provides users with the ability to set configurable daily limits for deposits and withdrawals, with real-time tracking and enforcement. This system integrates seamlessly with the existing payment and transaction infrastructure.

## Features

### Core Functionality
- **User-configurable limits**: Users can set daily limits for deposits and withdrawals
- **Real-time enforcement**: Limits are checked before every transaction
- **Usage tracking**: Real-time tracking of daily usage against limits
- **Limit history**: Complete audit trail of limit changes
- **Unlimited option**: Users can disable limits for unlimited transactions
- **Progress visualization**: Visual progress bars showing usage against limits

### Integration Points
- **Deposit transactions**: Paystack deposits are checked against deposit limits
- **Withdrawal transactions**: Bank withdrawals are checked against withdrawal limits
- **Peer-to-peer payments**: Payments are treated as withdrawals for the sender and deposits for the receiver
- **Real-time updates**: Usage is updated immediately after successful transactions

## Database Schema

### Tables

#### `user_daily_limits`
Stores user-configured daily limits.
```sql
CREATE TABLE user_daily_limits (
    limit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    limit_type VARCHAR(20) NOT NULL CHECK (limit_type IN ('deposit', 'withdrawal')),
    daily_limit_cents BIGINT NOT NULL CHECK (daily_limit_cents > 0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, limit_type),
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);
```

#### `daily_transaction_usage`
Tracks daily usage against limits.
```sql
CREATE TABLE daily_transaction_usage (
    usage_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')),
    total_amount_cents BIGINT NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    last_transaction_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, transaction_date, transaction_type),
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);
```

#### `limit_change_history`
Audit trail for limit changes.
```sql
CREATE TABLE limit_change_history (
    history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    limit_type VARCHAR(20) NOT NULL CHECK (limit_type IN ('deposit', 'withdrawal')),
    old_limit_cents BIGINT,
    new_limit_cents BIGINT NOT NULL,
    changed_by VARCHAR(50) DEFAULT 'user',
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES luno_users(user_id) ON DELETE CASCADE
);
```

### Database Functions

#### `get_user_daily_limit(user_id, limit_type)`
Returns the user's daily limit for a specific type.

#### `get_user_daily_usage(user_id, limit_type, date)`
Returns the user's daily usage for a specific type and date.

#### `update_daily_usage(user_id, limit_type, amount_cents, date)`
Updates the daily usage for a user.

#### `check_daily_limit(user_id, limit_type, amount_cents, date)`
Checks if a transaction would exceed the daily limit.

## API Endpoints

### Authentication
All endpoints require user authentication via the `ensureAuth` middleware.

### Endpoints

#### `POST /api/limits/set`
Set a daily limit for deposits or withdrawals.

**Request Body:**
```json
{
    "limitType": "deposit|withdrawal",
    "amount": 5000.00,
    "reason": "Optional reason for the change"
}
```

**Response:**
```json
{
    "success": true,
    "message": "Daily deposit limit set to R5,000.00",
    "limit": {
        "type": "deposit",
        "amountRands": 5000.00,
        "amountCents": 500000
    }
}
```

#### `GET /api/limits`
Get user's current daily limits.

**Response:**
```json
{
    "success": true,
    "limits": {
        "deposit": {
            "amountRands": "5000.00",
            "amountCents": 500000,
            "isActive": true,
            "createdAt": "2025-09-09T12:58:50.184Z",
            "updatedAt": "2025-09-09T12:58:50.184Z"
        },
        "withdrawal": {
            "amountRands": "2000.00",
            "amountCents": 200000,
            "isActive": true,
            "createdAt": "2025-09-09T12:58:50.215Z",
            "updatedAt": "2025-09-09T12:58:50.215Z"
        }
    }
}
```

#### `GET /api/limits/status`
Get comprehensive limit status including usage.

**Query Parameters:**
- `date` (optional): Date to check (YYYY-MM-DD format)

**Response:**
```json
{
    "success": true,
    "date": "2025-09-09",
    "limits": {
        "deposit": { /* limit details */ },
        "withdrawal": { /* limit details */ }
    },
    "usage": {
        "deposit": {
            "amountRands": "1500.00",
            "amountCents": 150000,
            "transactionCount": 3,
            "lastTransactionAt": "2025-09-09T12:58:50.283Z"
        },
        "withdrawal": { /* usage details */ }
    },
    "status": {
        "deposit": {
            "isLimited": true,
            "remaining": {
                "amountRands": 3500,
                "amountCents": 350000
            }
        },
        "withdrawal": { /* status details */ }
    }
}
```

#### `POST /api/limits/check`
Check if a transaction would exceed daily limit.

**Request Body:**
```json
{
    "limitType": "deposit|withdrawal",
    "amount": 1000.00,
    "date": "2025-09-09"
}
```

**Response:**
```json
{
    "success": true,
    "isWithinLimit": true,
    "currentUsage": {
        "amountRands": "1500.00",
        "amountCents": 150000
    },
    "dailyLimit": {
        "amountRands": "5000.00",
        "amountCents": 500000
    },
    "remainingLimit": {
        "amountRands": "3500.00",
        "amountCents": 350000
    }
}
```

#### `GET /api/limits/usage/:type`
Get daily usage for a specific type.

**Path Parameters:**
- `type`: "deposit" or "withdrawal"

**Query Parameters:**
- `date` (optional): Date to check (YYYY-MM-DD format)

#### `DELETE /api/limits/:type`
Disable a daily limit (set to unlimited).

**Path Parameters:**
- `type`: "deposit" or "withdrawal"

**Request Body:**
```json
{
    "reason": "Optional reason for disabling"
}
```

#### `GET /api/limits/history`
Get limit change history.

**Query Parameters:**
- `type` (optional): Filter by limit type
- `limit` (optional): Number of records to return (default: 50)

#### `GET /api/limits/suggestions`
Get suggested limits based on usage patterns.

#### `GET /api/limits/test`
Test endpoint to verify the limits system is working.

## Frontend Integration

### Limits Page (`/limits`)
The limits page provides a comprehensive interface for managing daily limits:

- **Set Limits**: Input fields for deposit and withdrawal limits
- **Quick Actions**: Buttons to disable limits or refresh status
- **Usage Visualization**: Progress bars showing current usage against limits
- **Limit History**: Scrollable history of limit changes
- **Real-time Updates**: Automatic refresh of usage information

### Key Features
- **Real-time API integration**: All data is fetched from the backend API
- **Visual progress indicators**: Progress bars show usage percentage
- **Alert system**: Warnings when approaching or exceeding limits
- **Responsive design**: Works on all device sizes
- **Error handling**: Graceful error handling with user-friendly messages

## Integration with Transaction System

### Deposit Transactions
1. User initiates deposit via Paystack
2. System checks daily deposit limit
3. If within limit, transaction proceeds
4. If exceeds limit, transaction is blocked with detailed error message
5. After successful deposit, daily usage is updated

### Withdrawal Transactions
1. User initiates withdrawal
2. System checks daily withdrawal limit
3. If within limit, transaction proceeds
4. If exceeds limit, transaction is blocked with detailed error message
5. After successful withdrawal, daily usage is updated

### Peer-to-Peer Payments
1. Sender initiates payment
2. System checks sender's daily withdrawal limit
3. If within limit, payment proceeds
4. After successful payment:
   - Sender's withdrawal usage is updated
   - Receiver's deposit usage is updated

## Error Handling

### Limit Exceeded Errors
When a transaction would exceed the daily limit, the system returns:
```json
{
    "success": false,
    "message": "Daily withdrawal limit exceeded. You have used R1,500.00 of your R2,000.00 daily limit. Remaining: R500.00.",
    "limitInfo": {
        "currentUsage": {
            "amountRands": "1500.00",
            "amountCents": 150000
        },
        "dailyLimit": {
            "amountRands": "2000.00",
            "amountCents": 200000
        },
        "remainingLimit": {
            "amountRands": "500.00",
            "amountCents": 50000
        }
    }
}
```

### System Errors
- Database connection errors are logged but don't fail transactions
- API errors are returned with appropriate HTTP status codes
- Frontend errors are displayed to users with helpful messages

## Security Considerations

### Data Protection
- All amounts are stored in cents to avoid floating-point precision issues
- User authentication is required for all limit operations
- Audit trail is maintained for all limit changes

### Rate Limiting
- API endpoints are protected by authentication middleware
- Database queries are optimized with proper indexing
- Usage updates are atomic to prevent race conditions

## Performance Optimizations

### Database Indexes
- `idx_user_daily_limits_user_id`: Fast user limit lookups
- `idx_daily_usage_user_date`: Fast usage queries by user and date
- `idx_limit_history_user_id`: Fast history queries

### Caching Strategy
- Limit checks are performed in real-time
- Usage data is updated immediately after transactions
- Historical data is queried on-demand

## Testing

### Unit Tests
- Model functions are tested with various scenarios
- Database functions are tested with edge cases
- API endpoints are tested with different inputs

### Integration Tests
- Full transaction flow with limits
- Error handling scenarios
- Performance under load

### Test Scripts
- `test-limits-system.js`: Tests the model layer
- `test-limits-with-real-user.js`: Tests with real database data
- `test-limits-api.js`: Tests API endpoints

## Deployment

### Database Setup
1. Run `node setup-daily-limits.js` to create tables and functions
2. Verify tables are created correctly
3. Test database functions

### Application Integration
1. Ensure all imports are correct
2. Verify routes are registered in `server.js`
3. Test API endpoints with authentication

### Frontend Deployment
1. Update the limits page with new functionality
2. Test all user interactions
3. Verify real-time updates work correctly

## Monitoring and Maintenance

### Logging
- All limit checks are logged
- Usage updates are logged
- Error conditions are logged with stack traces

### Monitoring
- Database performance should be monitored
- API response times should be tracked
- Error rates should be monitored

### Maintenance
- Regular cleanup of old usage data
- Performance optimization based on usage patterns
- Security updates as needed

## Future Enhancements

### Planned Features
- **Weekly/Monthly limits**: Extend beyond daily limits
- **Category-based limits**: Different limits for different transaction types
- **Temporary limit increases**: Allow users to temporarily increase limits
- **Family account limits**: Shared limits for family accounts
- **Advanced analytics**: Detailed usage analytics and insights

### Technical Improvements
- **Caching layer**: Redis caching for frequently accessed data
- **Event-driven updates**: Real-time updates via WebSockets
- **Machine learning**: Predictive limit suggestions based on usage patterns
- **Mobile app integration**: Native mobile app support

## Conclusion

The Daily Limits System provides a robust, user-friendly solution for managing transaction limits. It integrates seamlessly with the existing payment infrastructure while providing comprehensive tracking, enforcement, and management capabilities. The system is designed to be scalable, secure, and maintainable, with clear separation of concerns and comprehensive error handling.

