import json
import uuid
import datetime
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

SEATS_TABLE = 'Seats'
BOOKINGS_TABLE = 'Bookings'
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
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST"
    }
    
    # Handle preflight options
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
        
    try:
        method = event.get('httpMethod')
        
        # 1. Handle GET /seats?busId=...&date=...
        if method == 'GET':
            params = event.get('queryStringParameters') or {}
            bus_id = params.get('busId')
            date_val = params.get('date')
            
            if not bus_id:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Missing busId parameter'})
                }
                
            logger.info(f"Fetching seats occupancy for bus '{bus_id}' on date '{date_val}'...")
            
            seats_table = dynamodb.Table(SEATS_TABLE)
            # Query active seats by busId
            response = seats_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('busId').eq(bus_id)
            )
            seats = response.get('Items', [])
            
            # Simple list of occupied seats where status = BOOKED
            occupied_seats = [s.get('seatNumber') for s in seats if s.get('status') == 'BOOKED']
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'occupiedSeats': occupied_seats})
            }
            
        # 2. Handle POST /book (Reserve single seat)
        elif method == 'POST':
            body = json.loads(event.get('body', '{}'))
            
            user_id = body.get('userId')
            bus_id = body.get('busId')
            seat_number = body.get('seatNumber')
            passenger_name = body.get('passengerName')
            age = int(body.get('age') or 0)
            gender = body.get('gender')
            phone = body.get('phone')
            email = body.get('email')
            journey_date = body.get('journeyDate')
            price = Decimal(str(body.get('price') or 0))
            
            # Step Validation
            if not all([user_id, bus_id, seat_number, passenger_name, age, gender, phone, email, journey_date, price]):
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Missing ticket details for booking'})
                }
                
            seats_table = dynamodb.Table(SEATS_TABLE)
            bookings_table = dynamodb.Table(BOOKINGS_TABLE)
            bus_table = dynamodb.Table(BUSDETAILS_TABLE)
            
            # 2a. Verify seat status
            seat_response = seats_table.get_item(
                Key={'busId': bus_id, 'seatNumber': seat_number}
            )
            seat_item = seat_response.get('Item')
            
            if seat_item and seat_item.get('status') == 'BOOKED':
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Seat Already Booked'})
                }
                
            # 2b. Fetch Bus Name for receipt
            bus_response = bus_table.get_item(Key={'busId': bus_id})
            bus_item = bus_response.get('Item')
            bus_name = bus_item.get('busName', 'Express Bus') if bus_item else 'Express Bus'
            
            # 2c. Create booking inside Bookings table (PENDING)
            booking_id = "BK_" + str(uuid.uuid4().hex[:8]).upper()
            created_at = datetime.datetime.utcnow().isoformat()
            
            booking_item = {
                'bookingId': booking_id,
                'userId': user_id,
                'busId': bus_id,
                'busName': bus_name,
                'seatNumber': seat_number,
                'passengerName': passenger_name,
                'age': age,
                'gender': gender,
                'phone': phone,
                'email': email,
                'journeyDate': journey_date,
                'price': price,
                'bookingStatus': 'PENDING',
                'paymentStatus': 'PENDING',
                'createdAt': created_at
            }
            bookings_table.put_item(Item=booking_item)
            logger.info(f"Booking {booking_id} created in PENDING status.")
            
            # 2d. Update Seats table to BOOKED
            seats_table.put_item(
                Item={
                    'busId': bus_id,
                    'seatNumber': seat_number,
                    'status': 'BOOKED',
                    'bookedBy': user_id,
                    'bookingId': booking_id
                }
            )
            logger.info(f"Seat {seat_number} status updated to BOOKED.")
            
            # 2e. Update BusDetails: Decrease availableSeats
            try:
                bus_table.update_item(
                    Key={'busId': bus_id},
                    UpdateExpression="SET availableSeats = availableSeats - :val",
                    ExpressionAttributeValues={':val': Decimal('1')},
                    ConditionExpression="availableSeats > :zero"
                )
                logger.info(f"Decreased availableSeats for bus {bus_id}.")
            except ClientError as e:
                # If transaction conditional check fails, or failure exists
                logger.error(f"Failed to decrease seat count: {str(e)}", exc_info=True)
                
            # 2f. Publish SNS Notification
            try:
                sns_message = (
                    f"Booking Created\n\n"
                    f"Booking ID\n{booking_id}\n\n"
                    f"Passenger\n{passenger_name}\n\n"
                    f"Bus\n{bus_name}\n\n"
                    f"Seat\n{seat_number}\n\n"
                    f"Journey Date\n{journey_date}"
                )
                sns_client.publish(
                    TopicArn=SNS_TOPIC_ARN,
                    Subject="Booking Created",
                    Message=sns_message
                )
                logger.info("SNS Ticket Created notification published.")
            except Exception as sns_err:
                logger.error(f"SNS Publish Error: {str(sns_err)}", exc_info=True)
                
            return {
                'statusCode': 201,
                'headers': headers,
                'body': json.dumps({
                    'message': 'Booking Created',
                    'bookingId': booking_id,
                    'busName': bus_name
                }, cls=DecimalEncoder)
            }
            
        else:
            return {
                'statusCode': 405,
                'headers': headers,
                'body': json.dumps({'message': 'Method Not Allowed'})
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
