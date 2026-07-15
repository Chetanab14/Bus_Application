import json
import uuid
import datetime
import boto3
import logging
from botocore.exceptions import ClientError

# Configure Logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
sns_client = boto3.client('sns')

USERS_TABLE = 'Users'
SNS_TOPIC_ARN = 'arn:aws:sns:ap-south-1:317588557799:BusBooking:11dda2a4-6459-4c43-8553-002dad5db243'

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
        name = body.get('fullName') or body.get('name')
        email = body.get('email')
        phone = body.get('mobile') or body.get('phone')
        password = body.get('password')
        
        # Validation checks
        if not name or not email or not phone or not password:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Missing email, password, name, or phone'})
            }
            
        table = dynamodb.Table(USERS_TABLE)
        
        # Check if email already exists (using scan or query if indexed)
        # Using simple scan for demo/simulated index fallback 
        response = table.scan(
            FilterExpression="email = :emailVal",
            ExpressionAttributeValues={":emailVal": email}
        )
        if response.get('Items'):
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Email already registered'})
            }
            
        # Create fields
        user_id = str(uuid.uuid4())
        created_at = datetime.datetime.utcnow().isoformat()
        
        new_user = {
            'userId': user_id,
            'name': name,
            'email': email,
            'phone': phone,
            'password': password,
            'createdAt': created_at
        }
        
        # Put item into DynamoDB
        table.put_item(Item=new_user)
        logger.info(f"User {user_id} put successfully in {USERS_TABLE} table.")
        
        # Attempt to Publish SNS notification
        try:
            sns_message = (
                f"New User Registered\n\n"
                f"Name\n{name}\n\n"
                f"Email\n{email}\n\n"
                f"Phone\n{phone}\n\n"
                f"Registration Time\n{created_at}"
            )
            
            sns_client.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject="New User Registration",
                Message=sns_message
            )
            logger.info("SNS New User Notification sent successfully.")
        except Exception as sns_err:
            # CloudWatch logging only, DO NOT fail user transaction
            logger.error(f"SNS Publish Failure: {str(sns_err)}", exc_info=True)
            
        return {
            'statusCode': 201,
            'headers': headers,
            'body': json.dumps({
                'message': 'Registration Successful',
                'userId': user_id,
                'name': name,
                'email': email,
                'mobile': phone
            })
        }
        
    except ClientError as e:
        logger.error(f"DynamoDB ClientError: {e.response['Error']['Message']}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': 'Internal Server Error. DynamoDB write failed.'})
        }
    except Exception as e:
        logger.error(f"General Execution Failure: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': f'Server failure: {str(e)}'})
        }
