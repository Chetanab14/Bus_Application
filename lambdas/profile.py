import json
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
        body = json.loads(event.get('body', '{}'))
        path = event.get('path', '')
        
        # Check action type
        is_update = body.get('name') or body.get('fullName') or ('update' in path) or ('update' in event.get('resource', ''))
        
        table = dynamodb.Table(USERS_TABLE)
        
        # 1. Handle POST /updateprofile
        if is_update:
            user_id = body.get('userId')
            name = body.get('fullName') or body.get('name')
            email = body.get('email')
            phone = body.get('mobile') or body.get('phone')
            
            if not user_id or not name or not email or not phone:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Missing userId, name, email, or phone'})
                }
                
            logger.info(f"Updating user profile for user '{user_id}'...")
            
            # Update DynamoDB Table
            table.update_item(
                Key={'userId': user_id},
                UpdateExpression="SET #n = :nameVal, email = :emailVal, phone = :phoneVal",
                ExpressionAttributeNames={"#n": "name"},
                ExpressionAttributeValues={
                    ":nameVal": name,
                    ":emailVal": email,
                    ":phoneVal": phone
                }
            )
            logger.info(f"User {user_id} profile updated in DynamoDB.")
            
            # Publish SNS notification
            try:
                sns_message = (
                    f"Name\n{name}\n\n"
                    f"Email\n{email}\n\n"
                    f"Phone\n{phone}\n\n"
                    f"Profile updated successfully."
                )
                sns_client.publish(
                    TopicArn=SNS_TOPIC_ARN,
                    Subject="Profile Updated",
                    Message=sns_message
                )
                logger.info("SNS Profile Updated notification published.")
            except Exception as sns_err:
                logger.error(f"SNS Profile Update Publish Error: {str(sns_err)}", exc_info=True)
                
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({
                    'message': 'Profile updated successfully',
                    'userId': user_id,
                    'name': name,
                    'email': email,
                    'mobile': phone
                })
            }
            
        # 2. Handle POST /profile (Read profile details)
        else:
            user_id = body.get('userId')
            if not user_id:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Missing userId parameter'})
                }
                
            logger.info(f"Reading profile for user '{user_id}'...")
            
            response = table.get_item(Key={'userId': user_id})
            user_item = response.get('Item')
            
            if not user_item:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'message': 'User profile not found'})
                }
                
            # Exclude password in return object for safety
            safe_user = {
                'userId': user_item.get('userId'),
                'name': user_item.get('name'),
                'email': user_item.get('email'),
                'phone': user_item.get('phone') or user_item.get('mobile', '')
            }
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(safe_user)
            }
            
    except ClientError as e:
        logger.error(f"DynamoDB ClientError: {e.response['Error']['Message']}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': 'Database operation failed'})
        }
    except Exception as e:
        logger.error(f"Server General Error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': f'Server failure: {str(e)}'})
        }
