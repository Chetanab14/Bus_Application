import json
import boto3
import logging
from botocore.exceptions import ClientError

# Configure Logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')

USERS_TABLE = 'Users'

def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")
    
    # Enable CORS headers
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    }
    
    # Handle preflight options
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
        
    try:
        # Parse Request JSON
        body = json.loads(event.get('body', '{}'))
        email = body.get('email')
        password = body.get('password')
        
        # Validation checks
        if not email or not password:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Missing email or password'})
            }
            
        # Admin bypass scenario
        if email == "admin" and password == "admin123":
            logger.info("Admin logging in via standard bypass route.")
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'userId': 'admin_id',
                    'name': 'System Admin',
                    'email': 'admin',
                    'isAdmin': True
                })
            }
            
        table = dynamodb.Table(USERS_TABLE)
        
        # Search scan in Users database
        response = table.scan(
            FilterExpression="email = :emailVal",
            ExpressionAttributeValues={":emailVal": email}
        )
        items = response.get('Items', [])
        
        if not items:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'message': 'Invalid email or password'})
            }
            
        user = items[0]
        # Validate Password
        if user.get('password') != password:
            return {
                'statusCode': 401,
                'headers': headers,
                'body': json.dumps({'message': 'Invalid email or password'})
            }
            
        logger.info(f"User {user.get('userId')} authenticated successfully.")
        
        # Return user details
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'userId': user.get('userId'),
                'name': user.get('name'),
                'email': user.get('email'),
                'mobile': user.get('phone') or user.get('mobile', '')
            })
        }
        
    except ClientError as e:
        logger.error(f"DynamoDB ClientError: {e.response['Error']['Message']}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': 'Internal Server Error. DynamoDB read failed.'})
        }
    except Exception as e:
        logger.error(f"General Execution Failure: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': f'Server failure: {str(e)}'})
        }
