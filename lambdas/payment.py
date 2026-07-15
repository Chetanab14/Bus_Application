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

PAYMENTS_TABLE = 'Payments'
BOOKINGS_TABLE = 'Bookings'
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
        booking_id = body.get('bookingId')
        payment_method = body.get('paymentMethod')
        amount = Decimal(str(body.get('amount') or 0))
        user_id = body.get('userId')
        
        # Validation checks
        if not booking_id or not payment_method or not amount:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'message': 'Missing bookingId, paymentMethod, or amount'})
            }
            
        payments_table = dynamodb.Table(PAYMENTS_TABLE)
        bookings_table = dynamodb.Table(BOOKINGS_TABLE)
        
        # 1. Fetch Booking Details to verify and get items for message
        booking_response = bookings_table.get_item(Key={'bookingId': booking_id})
        booking_item = booking_response.get('Item')
        
        if not booking_item:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'message': 'Booking not found'})
            }
            
        # Get userId from booking if not sent in request
        if not user_id:
            user_id = booking_item.get('userId', 'anonymous_user')
            
        # 2. Store Payment transaction details
        payment_id = "PAY_" + str(uuid.uuid4().hex[:8]).upper()
        transaction_date = datetime.datetime.utcnow().isoformat()
        
        payments_table.put_item(
            Item={
                'paymentId': payment_id,
                'bookingId': booking_id,
                'userId': user_id,
                'amount': amount,
                'paymentMethod': payment_method,
                'paymentStatus': 'SUCCESS',
                'transactionDate': transaction_date
            }
        )
        logger.info(f"Payment {payment_id} recorded in Payments table.")
        
        # 3. Update status in Bookings table
        bookings_table.update_item(
            Key={'bookingId': booking_id},
            UpdateExpression="SET bookingStatus = :bStatus, paymentStatus = :pStatus",
            ExpressionAttributeValues={
                ':bStatus': 'CONFIRMED',
                ':pStatus': 'SUCCESS'
            }
        )
        logger.info(f"Booking {booking_id} status updated to CONFIRMED / SUCCESS.")
        
        # Extract metadata from booking item
        passenger_name = booking_item.get('passengerName', 'Passenger')
        bus_name = booking_item.get('busName', 'Express Bus')
        seat_number = booking_item.get('seatNumber', 'N/A')
        journey_date = booking_item.get('journeyDate', 'N/A')
        from_city = booking_item.get('fromCity', '')  # Note: if fromCity/toCity are not in bookings table directly, default to route description
        to_city = booking_item.get('toCity', '')
        if not from_city or not to_city:
            from_city = "Departure Stop"
            to_city = "Arrival Stop"
            
        # 4. Publish SNS Notification 1: Booking Confirmed
        try:
            confirmed_msg = (
                f"Booking ID\n{booking_id}\n\n"
                f"Passenger Name\n{passenger_name}\n\n"
                f"Bus Name\n{bus_name}\n\n"
                f"Seat Number\n{seat_number}\n\n"
                f"Journey\n{from_city} to {to_city}\n\n"
                f"Travel Date\n{journey_date}\n\n"
                f"Amount Paid\n{amount}\n\n"
                f"Payment Method\n{payment_method}\n\n"
                f"Booking Status\nCONFIRMED"
            )
            sns_client.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject="Booking Confirmed",
                Message=confirmed_msg
            )
            logger.info("SNS Booking Confirmed notification published.")
        except Exception as sns_err:
            logger.error(f"SNS Booking Confirmed Publish Error: {str(sns_err)}", exc_info=True)
            
        # 5. Publish SNS Notification 2: Payment Successful
        try:
            success_msg = (
                f"Payment ID\n{payment_id}\n\n"
                f"Booking ID\n{booking_id}\n\n"
                f"Amount\n{amount}\n\n"
                f"Payment Method\n{payment_method}\n\n"
                f"Payment Status\nSUCCESS"
            )
            sns_client.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject="Payment Successful",
                Message=success_msg
            )
            logger.info("SNS Payment Successful notification published.")
        except Exception as sns_err:
            logger.error(f"SNS Payment Successful Publish Error: {str(sns_err)}", exc_info=True)
            
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': 'Payment successful and ticket confirmed',
                'paymentId': payment_id,
                'bookingId': booking_id,
                'status': 'CONFIRMED'
            }, cls=DecimalEncoder)
        }
        
    except ClientError as e:
        logger.error(f"DynamoDB ClientError: {e.response['Error']['Message']}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': 'Internal database update failed'})
        }
    except Exception as e:
        logger.error(f"Server General Error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': f'Server failure: {str(e)}'})
        }
