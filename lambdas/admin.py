import json
import uuid
import boto3
import logging
from botocore.exceptions import ClientError
from decimal import Decimal

# Configure Logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
sns_client = boto3.client('sns')

BUSDETAILS_TABLE = 'BusDetails'
SNS_TOPIC_ARN = 'arn:aws:sns:ap-south-1:317588557799:BusBooking:11dda2a4-6459-4c43-8553-002dad5db243'

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj) if obj % 1 > 0 else int(obj)
        return super(DecimalEncoder, self).default(obj)

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
        resource = event.get('resource', '')
        
        table = dynamodb.Table(BUSDETAILS_TABLE)
        
        # 1. ADD BUS OPERATION
        if 'addbus' in path or 'addbus' in resource or body.get('action') == 'add':
            bus_name = body.get('name') or body.get('busName')
            bus_number = body.get('number') or body.get('busNumber')
            bus_type = body.get('type') or body.get('busType')
            from_city = body.get('fromCity')
            to_city = body.get('toCity')
            departure = body.get('departure') or body.get('departureTime')
            arrival = body.get('arrival') or body.get('arrivalTime')
            duration = body.get('duration') or "0h 00m"
            price = Decimal(str(body.get('price') or 0))
            seats = Decimal(str(body.get('seats') or body.get('totalSeats') or 30))
            
            # Validation
            if not all([bus_name, bus_number, bus_type, from_city, to_city, departure, arrival, price]):
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Missing required bus configurations (name, number, route, times, or fare)'})
                }
                
            bus_id = "bus_" + str(uuid.uuid4().hex[:8])
            
            bus_item = {
                'busId': bus_id,
                'busName': bus_name,
                'busNumber': bus_number,
                'busType': bus_type,
                'fromCity': from_city,
                'toCity': to_city,
                'departureTime': departure,
                'arrivalTime': arrival,
                'duration': duration,
                'price': price,
                'totalSeats': seats,
                'availableSeats': seats,
                'rating': Decimal('4.2'),
                'amenities': body.get('amenities') or ["Wi-Fi", "Charging Point", "Water Bottle"],
                'status': 'ACTIVE'
            }
            
            table.put_item(Item=bus_item)
            logger.info(f"Bus {bus_id} added successfully in DynamoDB.")
            
            # Publish SNS
            try:
                sns_message = (
                    f"New Bus Added\n\n"
                    f"Bus Name\n{bus_name}\n\n"
                    f"Bus Number\n{bus_number}\n\n"
                    f"Bus Type\n{bus_type}\n\n"
                    f"Route\n{from_city} to {to_city}\n\n"
                    f"Departure\n{departure}\n\n"
                    f"Arrival\n{arrival}\n\n"
                    f"Price\n₹{price}"
                )
                sns_client.publish(
                    TopicArn=SNS_TOPIC_ARN,
                    Subject="New Bus Added",
                    Message=sns_message
                )
                logger.info("SNS New Bus Added notification sent successfully.")
            except Exception as sns_err:
                logger.error(f"SNS Publish Error: {str(sns_err)}", exc_info=True)
                
            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps({'success': True, 'data': bus_item}, cls=DecimalEncoder)
            }
            
        # 2. UPDATE BUS OPERATION
        elif 'updatebus' in path or 'updatebus' in resource or body.get('action') == 'update':
            bus_id = body.get('id') or body.get('busId')
            if not bus_id:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Missing busId for update'})
                }
                
            logger.info(f"Updating BusDetails for bus: {bus_id}")
            
            # Construct DynamoDB Update Expression
            update_expr = "SET "
            expr_vals = {}
            expr_names = {}
            
            allowed_fields = {
                'busName': 'busName',
                'name': 'busName',
                'busNumber': 'busNumber',
                'number': 'busNumber',
                'busType': 'busType',
                'type': 'busType',
                'fromCity': 'fromCity',
                'toCity': 'toCity',
                'departureTime': 'departureTime',
                'departure': 'departureTime',
                'arrivalTime': 'arrivalTime',
                'arrival': 'arrivalTime',
                'duration': 'duration',
                'price': 'price',
                'totalSeats': 'totalSeats',
                'seats': 'totalSeats',
                'availableSeats': 'availableSeats',
                'rating': 'rating',
                'amenities': 'amenities',
                'status': 'status'
            }
            
            updates = []
            for k, val in body.items():
                if k in allowed_fields:
                    db_field = allowed_fields[k]
                    
                    # Convert to numeric for fare/seat counts
                    if db_field in ['price', 'totalSeats', 'availableSeats', 'rating']:
                        val = Decimal(str(val))
                        
                    placeholder_val = f":val_{db_field}"
                    placeholder_name = f"#name_{db_field}"
                    
                    updates.append(f"{placeholder_name} = {placeholder_val}")
                    expr_vals[placeholder_val] = val
                    expr_names[placeholder_name] = db_field
                    
            if not updates:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'No update fields supplied'})
                }
                
            update_expr += ", ".join(updates)
            
            table.update_item(
                Key={'busId': bus_id},
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_vals,
                ExpressionAttributeNames=expr_names
            )
            logger.info(f"Bus {bus_id} updated successfully in DynamoDB.")
            
            # Publish SNS
            try:
                sns_client.publish(
                    TopicArn=SNS_TOPIC_ARN,
                    Subject="Bus Updated",
                    Message=f"Bus details updated successfully.\nBus ID: {bus_id}"
                )
                logger.info("SNS Bus Updated notification sent successfully.")
            except Exception as sns_err:
                logger.error(f"SNS Publish Error: {str(sns_err)}", exc_info=True)
                
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'success': True, 'message': 'Bus configuration updated'}, cls=DecimalEncoder)
            }
            
        # 3. DELETE BUS OPERATION
        elif 'deletebus' in path or 'deletebus' in resource or body.get('action') == 'delete':
            bus_id = body.get('id') or body.get('busId')
            if not bus_id:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Missing busId for delete'})
                }
                
            logger.info(f"Removing Bus operator: {bus_id}")
            
            # Delete item completely or set status to INACTIVE. We delete from DB
            table.delete_item(Key={'busId': bus_id})
            logger.info(f"Bus {bus_id} deleted successfully from DynamoDB.")
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'success': True, 'message': f'Bus {bus_id} deleted'})
            }
            
        else:
            return {
                'statusCode': 405,
                'headers': headers,
                'body': json.dumps({'message': 'Operation method/action not supported'})
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
