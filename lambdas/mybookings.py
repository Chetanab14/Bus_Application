import json
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

BOOKINGS_TABLE = 'Bookings'
SEATS_TABLE = 'Seats'
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
        
        # Determine route by checking if cancel is in body or path
        is_cancel = body.get('bookingId') and (('cancel' in path) or ('cancel' in event.get('resource', '')))
        # Failsafe check: if direct routing doesn't split path, check body params
        # In custom integrations, cancel might hit the same lambda with action = cancel
        if body.get('action') == 'cancel' or 'cancel' in event.get('resource', ''):
            is_cancel = True
            
        bookings_table = dynamodb.Table(BOOKINGS_TABLE)
        
        # 1. Handle POST /cancel (Cancel booking, free seats)
        if is_cancel:
            booking_id = body.get('bookingId')
            bus_id = body.get('busId')
            seat_number = body.get('seats') or body.get('seatNumber') # Supports both array or singular parameter
            travel_date = body.get('travelDate') or body.get('journeyDate')
            
            # Validation checks
            if not booking_id:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Missing bookingId for cancellation'})
                }
                
            # If not sent, try fetching booking details dynamically
            booking_response = bookings_table.get_item(Key={'bookingId': booking_id})
            booking_item = booking_response.get('Item')
            
            if not booking_item:
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'message': 'Booking not found'})
                }
                
            if not bus_id:
                bus_id = booking_item.get('busId')
            if not seat_number:
                seat_number = booking_item.get('seatNumber')
            if not travel_date:
                travel_date = booking_item.get('journeyDate')
                
            passenger_name = booking_item.get('passengerName', 'Passenger')
            bus_name = booking_item.get('busName', 'Bus Coach')
            
            # 1a. Update Booking status to CANCELLED in DynamoDB
            bookings_table.update_item(
                Key={'bookingId': booking_id},
                UpdateExpression="SET bookingStatus = :cStatus",
                ExpressionAttributeValues={':cStatus': 'CANCELLED'}
            )
            logger.info(f"Booking {booking_id} status updated to CANCELLED.")
            
            # 1b. Update Seat status: BOOKED becomes AVAILABLE
            # We process seat_number representing array or single string value
            seats_to_free = []
            if isinstance(seat_number, list):
                seats_to_free = seat_number
            elif isinstance(seat_number, str):
                # If comma-separated or single string
                seats_to_free = [s.strip() for s in seat_number.split(',') if s.strip()]
            else:
                seats_to_free = [str(seat_number)]
                
            seats_table = dynamodb.Table(SEATS_TABLE)
            bus_table = dynamodb.Table(BUSDETAILS_TABLE)
            
            freed_count = 0
            for seat in seats_to_free:
                try:
                    # Update Seat status to AVAILABLE
                    seats_table.put_item(
                        Item={
                            'busId': bus_id,
                            'seatNumber': seat,
                            'status': 'AVAILABLE'
                        }
                    )
                    freed_count += 1
                except Exception as s_err:
                    logger.error(f"Error freeing seat {seat} for bus {bus_id}: {str(s_err)}", exc_info=True)
                    
            logger.info(f"Freed {freed_count} seats in seats table.")
            
            # 1c. Increase availableSeats in BusDetails
            if freed_count > 0:
                try:
                    bus_table.update_item(
                        Key={'busId': bus_id},
                        UpdateExpression="SET availableSeats = availableSeats + :val",
                        ExpressionAttributeValues={':val': Decimal(str(freed_count))}
                    )
                    logger.info(f"Increased availableSeats by {freed_count} for bus {bus_id}.")
                except Exception as b_err:
                    logger.error(f"Error updating availableseats count on bus: {str(b_err)}", exc_info=True)
                    
            # 1d. Publish SNS confirmation
            try:
                sns_message = (
                    f"Booking Cancelled\n\n"
                    f"Booking ID\n{booking_id}\n\n"
                    f"Passenger\n{passenger_name}\n\n"
                    f"Bus\n{bus_name}\n\n"
                    f"Seat\n{seat_number}\n\n"
                    f"Status\nCANCELLED"
                )
                sns_client.publish(
                    TopicArn=SNS_TOPIC_ARN,
                    Subject="Booking Cancelled",
                    Message=sns_message
                )
                logger.info("SNS Booking Cancelled notification published.")
            except Exception as sns_err:
                logger.error(f"SNS Cancellation Publish Error: {str(sns_err)}", exc_info=True)
                
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'message': 'Booking Cancelled successfully', 'bookingId': booking_id})
            }
            
        # 2. Handle POST /mybookings (Read user bookings)
        else:
            user_id = body.get('userId')
            if not user_id:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Missing userId parameter'})
                }
                
            logger.info(f"Fetching active bookings config for user '{user_id}'...")
            
            # Scan Bookings
            response = bookings_table.scan(
                FilterExpression="userId = :userIdVal",
                ExpressionAttributeValues={":userIdVal": user_id}
            )
            bookings_list = response.get('Items', [])
            logger.info(f"Fetched {len(bookings_list)} bookings.")
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(bookings_list, cls=DecimalEncoder)
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
