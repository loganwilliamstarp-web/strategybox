# AWS Secrets Manager Setup Guide

## Overview
This guide shows how to securely store and manage your API keys and sensitive configuration using AWS Secrets Manager.

## Prerequisites
- AWS CLI installed and configured
- AWS account with appropriate permissions
- Node.js application deployed on AWS (ECS, Lambda, EC2, etc.)

## Step 1: Create Secrets in AWS Secrets Manager

### Using AWS CLI
```bash
# Create the secret
aws secretsmanager create-secret \
    --name "options-tracker/secrets" \
    --description "API keys and secrets for Options Tracker application" \
    --region us-east-1

# Store the secret values
aws secretsmanager put-secret-value \
    --secret-id "options-tracker/secrets" \
    --secret-string '{
        "MARKETDATA_API_KEY": "your-marketdata-api-key-here",
        "DATABASE_URL": "postgresql://username:password@host:port/database",
        "SESSION_SECRET": "your-long-random-session-secret-here"
    }' \
    --region us-east-1
```

### Using AWS Console
1. Go to AWS Secrets Manager in the AWS Console
2. Click "Store a new secret"
3. Choose "Other type of secret"
4. Add key-value pairs:
   - `MARKETDATA_API_KEY`: Your MarketData.app API key
   - `DATABASE_URL`: Your database connection string
   - `SESSION_SECRET`: A long, random string for session encryption
5. Name the secret: `options-tracker/secrets`
6. Complete the wizard

## Step 2: Set Up IAM Permissions

### Create IAM Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret"
            ],
            "Resource": "arn:aws:secretsmanager:us-east-1:YOUR-ACCOUNT-ID:secret:options-tracker/secrets*"
        }
    ]
}
```

### Attach to Your Application Role
- For ECS: Attach to your ECS Task Role
- For Lambda: Attach to your Lambda Execution Role  
- For EC2: Attach to your EC2 Instance Role

## Step 3: Environment Variables

Set these environment variables for your application:

### Required for AWS Secrets Manager
```bash
AWS_REGION=us-east-1
AWS_SECRET_NAME=options-tracker/secrets
```

### For Local Development (optional)
```bash
NODE_ENV=development
MARKETDATA_API_KEY=your-dev-api-key
DATABASE_URL=your-dev-database-url
SESSION_SECRET=your-dev-session-secret
```

### For AWS Authentication (if not using IAM roles)
```bash
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Step 4: Application Configuration

The application will automatically:
1. Use AWS Secrets Manager in production
2. Fall back to environment variables in development
3. Cache secrets for 5 minutes to reduce API calls
4. Validate all required secrets are present

## Step 5: Deployment Considerations

### Docker Deployment
```dockerfile
# Don't copy .env files in production
# Secrets will be loaded from AWS Secrets Manager

ENV AWS_REGION=us-east-1
ENV AWS_SECRET_NAME=options-tracker/secrets
ENV NODE_ENV=production
```

### ECS Task Definition
```json
{
  "taskRoleArn": "arn:aws:iam::YOUR-ACCOUNT:role/OptionsTrackerTaskRole",
  "environment": [
    {
      "name": "AWS_REGION",
      "value": "us-east-1"
    },
    {
      "name": "AWS_SECRET_NAME", 
      "value": "options-tracker/secrets"
    },
    {
      "name": "NODE_ENV",
      "value": "production"
    }
  ]
}
```

## Step 6: Secret Rotation (Optional)

### Enable Automatic Rotation
```bash
aws secretsmanager rotate-secret \
    --secret-id "options-tracker/secrets" \
    --rotation-rules AutomaticallyAfterDays=30
```

### Manual Rotation
```bash
# Update secret with new values
aws secretsmanager put-secret-value \
    --secret-id "options-tracker/secrets" \
    --secret-string '{
        "MARKETDATA_API_KEY": "new-api-key",
        "DATABASE_URL": "new-database-url",
        "SESSION_SECRET": "new-session-secret"
    }'
```

## Step 7: Monitoring

### CloudWatch Metrics
- Monitor `secretsmanager:GetSecretValue` API calls
- Set up alarms for failed secret retrievals

### Application Logs
The application logs secret loading status:
- ✅ Successfully loaded secrets from AWS Secrets Manager
- 🔄 Falling back to environment variables for development
- ❌ Failed to load application secrets

## Security Best Practices

1. **Use IAM Roles**: Prefer IAM roles over access keys when possible
2. **Least Privilege**: Grant minimal permissions needed
3. **Rotate Secrets**: Regularly rotate API keys and secrets
4. **Monitor Access**: Set up CloudTrail logging for secret access
5. **Separate Environments**: Use different secrets for dev/staging/prod

## Cost Optimization

- Secrets Manager charges $0.40/month per secret
- $0.05 per 10,000 API calls
- Caching reduces API calls (implemented in the application)

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Check IAM role has `secretsmanager:GetSecretValue` permission
   - Verify resource ARN matches your secret

2. **Secret Not Found**
   - Check AWS_REGION matches where secret is stored
   - Verify AWS_SECRET_NAME is correct

3. **Invalid JSON**
   - Ensure secret value is valid JSON
   - Check for trailing commas or syntax errors

### Health Check Endpoint
The application provides a health check:
```bash
curl http://localhost:5000/api/health/secrets
```

This will return the status of secrets loading without exposing sensitive values.
