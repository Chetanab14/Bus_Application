import json
import uuid
import datetime
import logging
import boto3
from decimal import Decimal
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key

# Configure Logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS resource and clients
dynamodb = boto3.resource('dynamodb')
sns_client = boto3.client('sns')

# Resources
USERS_TABLE = 'Users'
BUSDETAILS_TABLE = 'BusDetails'
SEATS_TABLE = 'Seats'
BOOKINGS_TABLE = 'Bookings'
PAYMENTS_TABLE = 'Payments'
SNS_TOPIC_ARN = 'arn:aws:sns:ap-south-1:317588557799:BusBooking:11dda2a4-6459-4c43-8553-002dad5db243'

# Global CORS Headers
headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE"
}

class DecimalEncoder(json.JSONEncoder):
    """Custom encoder to handle DynamoDB Decimal types nicely in JSON."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj) if obj % 1 > 0 else int(obj)
        return super(DecimalEncoder, self).default(obj)

def response(status, body_data):
    """Helper to generate a structured API response with CORS support."""
    return {
        'statusCode': status,
        'headers': headers,
        'body': json.dumps(body_data, cls=DecimalEncoder)
    }

def publish_sns(subject, message):
    """Helper to publish notifications via Amazon SNS."""
    try:
        sns_client.publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject=subject,
            Message=message
        )
        logger.info(f"SNS notification '{subject}' sent successfully.")
    except Exception as e:
        # Never crash if SNS fails, just log to CloudWatch
        logger.error(f"SNS notification failed to publish for subject '{subject}': {str(e)}", exc_info=True)

def create_seats(bus_id, total_seats):
    """Helper to batch create seat records for a new bus route."""
    table = dynamodb.Table(SEATS_TABLE)
    try:
        with table.batch_writer() as batch:
            for i in range(1, total_seats + 1):
                seat_number = f"S{i}"
                batch.put_item(
                    Item={
                        'busId': bus_id,
                        'seatNumber': seat_number,
                        'status': 'AVAILABLE',
                        'bookedBy': None,
                        'bookingId': None
                    }
                )
        logger.info(f"Created {total_seats} seats for bus {bus_id} in Seats table successfully.")
        return True
    except Exception as e:
        logger.error(f"Failed to create seats batch for bus {bus_id}: {str(e)}", exc_info=True)
        return False

def update_available_seats(bus_id, offset):
    """Helper to increment/decrement available seats count on a BusDetails record."""
    table = dynamodb.Table(BUSDETAILS_TABLE)
    try:
        table.update_item(
            Key={'busId': bus_id},
            UpdateExpression="SET availableSeats = availableSeats + :pval",
            ExpressionAttributeValues={':pval': Decimal(str(offset))}
        )
        logger.info(f"Updated seat counter offset {offset} on bus {bus_id}.")
        return True
    except Exception as e:
        logger.error(f"Failed to update seat counter for bus {bus_id}: {str(e)}", exc_info=True)
        return False

def lambda_handler(event, context):
    logger.info(f"Received API Gateway Event: {json.dumps(event)}")
    
    # 1. OPTION Preflights for CORS
    http_method = event.get('httpMethod', 'OPTIONS')
    if http_method == 'OPTIONS':
        return response(200, '')
        
    path = event.get('path', '')
    
    # Normalizing paths for routing matching (stripping trailing slash)
    sub_path = path.rstrip('/')
    
    try:
        # Routing Table
        
        # ----------------------------------------------------
        # POST /register
        # ----------------------------------------------------
        if sub_path == "/register" and http_method == 'POST':
            body = json.loads(event.get('body') or '{}')
            name = body.get('name') or body.get('fullName')
            email = body.get('email')
            phone = body.get('phone') or body.get('mobile')
            password = body.get('password')
            
            if not all([name, email, phone, password]):
                return response(400, {'message': 'Missing name, email, phone, or password.'})
                
            users_table = dynamodb.Table(USERS_TABLE)
            # Scan for existing email in Users
            scan_res = users_table.scan(
                FilterExpression="email = :emailVal",
                ExpressionAttributeValues={":emailVal": email}
            )
            if scan_res.get('Items'):
                return response(400, {'message': 'Email already registered.'})
                
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
            users_table.put_item(Item=new_user)
            
            # Send SNS
            sns_msg = f"User Registration Success:\n\nName: {name}\nEmail: {email}\nPhone: {phone}\nTime: {created_at}"
            publish_sns("Registration Success", sns_msg)
            
            return response(201, {'message': 'Registration Successful', 'userId': user_id, 'user': new_user})
            
        # ----------------------------------------------------
        # POST /login
        # ----------------------------------------------------
        elif sub_path == "/login" and http_method == 'POST':
            body = json.loads(event.get('body') or '{}')
            email = body.get('email')
            password = body.get('password')
            
            if not email or not password:
                return response(400, {'message': 'Missing email or password.'})
                
            # Admin Bypass Route
            if email == "admin" and password == "admin123":
                return response(200, {
                    'message': 'Login Successful',
                    'userId': 'admin_id',
                    'name': 'System Admin',
                    'email': 'admin',
                    'isAdmin': True
                })
                
            users_table = dynamodb.Table(USERS_TABLE)
            scan_res = users_table.scan(
                FilterExpression="email = :emailVal",
                ExpressionAttributeValues={":emailVal": email}
            )
            items = scan_res.get('Items', [])
            if not items or items[0].get('password') != password:
                return response(401, {'message': 'Invalid email or password.'})
                
            user = items[0]
            # Exclude password in return
            user_profile = {
                'userId': user.get('userId'),
                'name': user.get('name'),
                'email': user.get('email'),
                'phone': user.get('phone')
            }
            return response(200, {'message': 'Login Successful', 'userId': user.get('userId'), 'user': user_profile})
            
        # ----------------------------------------------------
        # POST /addbus
        # ----------------------------------------------------
        elif sub_path == "/addbus" and http_method == 'POST':
            body = json.loads(event.get('body') or '{}')
            bus_name = body.get('busName') or body.get('name')
            bus_number = body.get('busNumber') or body.get('number')
            bus_type = body.get('busType') or body.get('type')
            from_city = body.get('fromCity')
            to_city = body.get('toCity')
            departure = body.get('departureTime') or body.get('departure')
            arrival = body.get('arrivalTime') or body.get('arrival')
            duration = body.get('duration') or "0h 00m"
            price = Decimal(str(body.get('price') or 0))
            total_seats = int(body.get('totalSeats') or body.get('seats') or 30)
            
            if not all([bus_name, bus_number, bus_type, from_city, to_city, departure, arrival, price]):
                return response(400, {'message': 'Missing required fields for introducing bus.'})
                
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
                'totalSeats': Decimal(str(total_seats)),
                'availableSeats': Decimal(str(total_seats)),
                'rating': Decimal('4.2'),
                'amenities': body.get('amenities') or ["Charging Point", "Water Bottle"],
                'status': 'ACTIVE'
            }
            
            # Put bus route details
            bus_table = dynamodb.Table(BUSDETAILS_TABLE)
            bus_table.put_item(Item=bus_item)
            
            # Automatically populate seats inside Seats table
            create_seats(bus_id, total_seats)
            
            # Publish SNS
            sns_msg = f"New Bus Added:\n\nName: {bus_name}\nRoute: {from_city} to {to_city}\nNumber: {bus_number}\nSeats count: {total_seats}"
            publish_sns("New Bus Added", sns_msg)
            
            return response(201, {'success': True, 'message': 'Bus added successfully', 'busId': bus_id, 'bus': bus_item})
            
        # ----------------------------------------------------
        # GET /buses
        # ----------------------------------------------------
        elif sub_path == "/buses" and http_method == 'GET':
            bus_table = dynamodb.Table(BUSDETAILS_TABLE)
            scan_res = bus_table.scan()
            buses = scan_res.get('Items', [])
            return response(200, buses)
            
        # ----------------------------------------------------
        # POST /search
        # ----------------------------------------------------
        elif sub_path == "/search" and http_method == 'POST':
            body = json.loads(event.get('body') or '{}')
            from_city = body.get('fromCity', '').strip()
            to_city = body.get('toCity', '').strip()
            # Note: travelDate can be logged, scan filters cities
            
            if not from_city or not to_city:
                return response(400, {'message': 'Missing fromCity or toCity values.'})
                
            bus_table = dynamodb.Table(BUSDETAILS_TABLE)
            scan_res = bus_table.scan()
            buses = scan_res.get('Items', [])
            
            matched = [
                b for b in buses
                if b.get('fromCity', '').lower() == from_city.lower() 
                and b.get('toCity', '').lower() == to_city.lower()
                and b.get('status', 'ACTIVE') != 'INACTIVE'
            ]
            return response(200, matched)
            
        # ----------------------------------------------------
        # GET /seats/{busId}
        # ----------------------------------------------------
        elif (sub_path.startswith("/seats") or "seats" in sub_path) and http_method == 'GET':
            # Extract busId. Path format is /seats/{busId} or query parameter
            p_params = event.get('pathParameters') or {}
            bus_id = p_params.get('busId')
            
            # Fallback path splitting if API Gateway routing doesn't isolate it
            if not bus_id:
                parts = [p for p in path.split('/') if p]
                if len(parts) > 1 and parts[0] == 'seats':
                    bus_id = parts[1]
            
            # Query parameter fallback
            if not bus_id:
                q_params = event.get('queryStringParameters') or {}
                bus_id = q_params.get('busId')
                
            if not bus_id:
                return response(400, {'message': 'Missing busId parameters.'})
                
            seats_table = dynamodb.Table(SEATS_TABLE)
            query_res = seats_table.query(
                KeyConditionExpression=Key('busId').eq(bus_id)
            )
            seats_list = query_res.get('Items', [])
            return response(200, {'occupiedSeats': [s.get('seatNumber') for s in seats_list if s.get('status') == 'BOOKED'], 'seats': seats_list})
            
        # ----------------------------------------------------
        # POST /book
        # ----------------------------------------------------
        elif sub_path == "/book" and http_method == 'POST':
            body = json.loads(event.get('body') or '{}')
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
            
            if not all([user_id, bus_id, seat_number, passenger_name, age, gender, phone, email, journey_date, price]):
                return response(400, {'message': 'Missing details to process booking.'})
                
            seats_table = dynamodb.Table(SEATS_TABLE)
            # Verify seat is AVAILABLE
            seat_res = seats_table.get_item(Key={'busId': bus_id, 'seatNumber': seat_number})
            seat_item = seat_res.get('Item')
            
            if seat_item and seat_item.get('status') == 'BOOKED':
                return response(400, {'message': 'Seat already booked.'})
                
            # Get bus details to find operator name
            bus_table = dynamodb.Table(BUSDETAILS_TABLE)
            bus_res = bus_table.get_item(Key={'busId': bus_id})
            bus_item = bus_res.get('Item')
            bus_name = bus_item.get('busName', 'Comfort Bus') if bus_item else 'Comfort Bus'
            
            booking_id = "BK_" + str(uuid.uuid4().hex[:8]).upper()
            created_at = datetime.datetime.utcnow().isoformat()
            
            booking_record = {
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
            
            # Put Booking
            bookings_table = dynamodb.Table(BOOKINGS_TABLE)
            bookings_table.put_item(Item=booking_record)
            
            # Update seat mapping
            seats_table.put_item(
                Item={
                    'busId': bus_id,
                    'seatNumber': seat_number,
                    'status': 'BOOKED',
                    'bookedBy': user_id,
                    'bookingId': booking_id
                }
            )
            
            # Decrease availableSeats in BusDetails
            update_available_seats(bus_id, -1)
            
            # Publish SNS
            sns_msg = f"Booking Created:\n\nBooking ID: {booking_id}\nPassenger: {passenger_name}\nSeat: {seat_number}\nBus: {bus_name}"
            publish_sns("Booking Created", sns_msg)
            
            return response(201, {'success': True, 'bookingId': booking_id, 'message': 'Booking Created', 'booking': booking_record})
            
        # ----------------------------------------------------
        # POST /payment
        # ----------------------------------------------------
        elif sub_path == "/payment" and http_method == 'POST':
            body = json.loads(event.get('body') or '{}')
            booking_id = body.get('bookingId')
            payment_method = body.get('paymentMethod') or "Online Payment"
            amount = Decimal(str(body.get('amount') or 0))
            
            if not booking_id or not amount:
                return response(400, {'message': 'Missing bookingId or amount.'})
                
            payment_id = "PAY_" + str(uuid.uuid4().hex[:8]).upper()
            transaction_date = datetime.datetime.utcnow().isoformat()
            
            new_payment = {
                'paymentId': payment_id,
                'bookingId': booking_id,
                'amount': amount,
                'paymentMethod': payment_method,
                'paymentStatus': 'SUCCESS',
                'transactionDate': transaction_date
            }
            
            # Save transaction
            payments_table = dynamodb.Table(PAYMENTS_TABLE)
            payments_table.put_item(Item=new_payment)
            
            # Update booking status
            bookings_table = dynamodb.Table(BOOKINGS_TABLE)
            bookings_table.update_item(
                Key={'bookingId': booking_id},
                UpdateExpression="SET paymentStatus = :pStatus, bookingStatus = :bStatus",
                ExpressionAttributeValues={':pStatus': 'SUCCESS', ':bStatus': 'CONFIRMED'}
            )
            
            # Publish SNS
            sns_msg = f"Payment Successful Details:\n\nPayment ID: {payment_id}\nBooking ID: {booking_id}\nAmount: ₹{amount}\nMethod: {payment_method}"
            publish_sns("Payment Success", sns_msg)
            
            return response(200, {'success': True, 'paymentId': payment_id, 'bookingId': booking_id, 'payment': new_payment})
            
        # ----------------------------------------------------
        # POST /confirmbooking
        # ----------------------------------------------------
        elif sub_path == "/confirmbooking" and http_method == 'POST':
            body = json.loads(event.get('body') or '{}')
            booking_id = body.get('bookingId')
            
            if not booking_id:
                return response(400, {'message': 'Missing bookingId to confirm.'})
                
            bookings_table = dynamodb.Table(BOOKINGS_TABLE)
            bookings_table.update_item(
                Key={'bookingId': booking_id},
                UpdateExpression="SET bookingStatus = :bStatus",
                ExpressionAttributeValues={':bStatus': 'CONFIRMED'}
            )
            
            # Publish SNS
            sns_msg = f"Booking Confirmation:\n\nBooking ID: {booking_id} status has been updated to CONFIRMED."
            publish_sns("Booking Confirmed", sns_msg)
            
            return response(200, {'success': True, 'message': 'Booking confirmed successfully'})
            
        # ----------------------------------------------------
        # POST /cancel
        # ----------------------------------------------------
        elif sub_path == "/cancel" and http_method == 'POST':
            body = json.loads(event.get('body') or '{}')
            booking_id = body.get('bookingId')
            
            if not booking_id:
                return response(400, {'message': 'Missing bookingId to cancel.'})
                
            bookings_table = dynamodb.Table(BOOKINGS_TABLE)
            # Retrieve booking info first
            booking_res = bookings_table.get_item(Key={'bookingId': booking_id})
            booking_item = booking_res.get('Item')
            
            if not booking_item:
                return response(404, {'message': 'Booking details not found.'})
                
            bus_id = booking_item.get('busId')
            seat_number = booking_item.get('seatNumber')
            
            # Update booking status to CANCELLED
            bookings_table.update_item(
                Key={'bookingId': booking_id},
                UpdateExpression="SET bookingStatus = :bStatus",
                ExpressionAttributeValues={':bStatus': 'CANCELLED'}
            )
            
            # Update seat mapping to open status
            seats_table = dynamodb.Table(SEATS_TABLE)
            if bus_id and seat_number:
                seats_table.put_item(
                    Item={
                        'busId': bus_id,
                        'seatNumber': seat_number,
                        'status': 'AVAILABLE',
                        'bookedBy': None,
                        'bookingId': None
                    }
                )
                # Increase available seats count in BusDetails
                update_available_seats(bus_id, 1)
                
            # Publish SNS
            sns_msg = f"Trip Cancellation Alert:\n\nBooking ID: {booking_id}\nBus ID: {bus_id}\nSeat: {seat_number} status updated to AVAILABLE."
            publish_sns("Booking Cancelled", sns_msg)
            
            return response(200, {'success': True, 'message': 'Cancellation processed successfully'})
            
        # ----------------------------------------------------
        # POST /mybookings
        # ----------------------------------------------------
        elif sub_path == "/mybookings" and http_method == 'POST':
            body = json.loads(event.get('body') or '{}')
            user_id = body.get('userId')
            
            if not user_id:
                return response(400, {'message': 'Missing userId parameter.'})
                
            bookings_table = dynamodb.Table(BOOKINGS_TABLE)
            scan_res = bookings_table.scan(
                FilterExpression="userId = :userIdVal",
                ExpressionAttributeValues={":userIdVal": user_id}
            )
            user_bookings = scan_res.get('Items', [])
            return response(200, user_bookings)
            
        # ----------------------------------------------------
        # GET /profile
        # ----------------------------------------------------
        elif sub_path == "/profile" and http_method == 'GET':
            # Handle query string params
            q_params = event.get('queryStringParameters') or {}
            user_id = q_params.get('userId')
            
            if not user_id:
                return response(400, {'message': 'Missing userId parameter.'})
                
            users_table = dynamodb.Table(USERS_TABLE)
            user_res = users_table.get_item(Key={'userId': user_id})
            user_item = user_res.get('Item')
            
            if not user_item:
                return response(404, {'message': 'User profile not found.'})
                
            # Strip password
            if 'password' in user_item:
                del user_item['password']
                
            return response(200, user_item)
            
        # ----------------------------------------------------
        # PUT /updateprofile
        # ----------------------------------------------------
        elif sub_path == "/updateprofile" and http_method == 'PUT':
            body = json.loads(event.get('body') or '{}')
            user_id = body.get('userId')
            fullName = body.get('fullName') or body.get('name')
            email = body.get('email')
            mobile = body.get('mobile') or body.get('phone')
            
            if not all([user_id, fullName, email, mobile]):
                return response(400, {'message': 'Missing userId, fullName, email or mobile parameters.'})
                
            users_table = dynamodb.Table(USERS_TABLE)
            users_table.update_item(
                Key={'userId': user_id},
                UpdateExpression="SET #n = :nVal, email = :eVal, phone = :pVal",
                ExpressionAttributeNames={"#n": "name"},
                ExpressionAttributeValues={
                    ":nVal": fullName,
                    ":eVal": email,
                    ":pVal": mobile
                }
            )
            
            # Publish SNS
            sns_msg = f"User profile details updated:\n\nUser ID: {user_id}\nName: {fullName}\nEmail: {email}\nPhone: {mobile}"
            publish_sns("Profile Updated", sns_msg)
            
            return response(200, {
                'success': True,
                'message': 'Profile updated successfully',
                'data': {'userId': user_id, 'name': fullName, 'email': email, 'phone': mobile}
            })
            
        # ----------------------------------------------------
        # PUT /updatebus
        # ----------------------------------------------------
        elif sub_path == "/updatebus" and http_method == 'PUT':
            body = json.loads(event.get('body') or '{}')
            bus_id = body.get('id') or body.get('busId')
            
            if not bus_id:
                return response(400, {'message': 'Missing busId parameters.'})
                
            bus_table = dynamodb.Table(BUSDETAILS_TABLE)
            
            update_parts = []
            expr_names = {}
            expr_vals = {}
            
            mapped_attrs = {
                'busName': 'busName', 'name': 'busName',
                'busNumber': 'busNumber', 'number': 'busNumber',
                'busType': 'busType', 'type': 'busType',
                'fromCity': 'fromCity',
                'toCity': 'toCity',
                'departureTime': 'departureTime', 'departure': 'departureTime',
                'arrivalTime': 'arrivalTime', 'arrival': 'arrivalTime',
                'duration': 'duration',
                'price': 'price',
                'totalSeats': 'totalSeats', 'seats': 'totalSeats',
                'availableSeats': 'availableSeats',
                'rating': 'rating',
                'amenities': 'amenities',
                'status': 'status'
            }
            
            for key, val in body.items():
                if key in mapped_attrs:
                    db_attr = mapped_attrs[key]
                    if db_attr in ['price', 'totalSeats', 'availableSeats', 'rating']:
                        val = Decimal(str(val))
                        
                    placeholder_name = f"#name_{db_attr}"
                    placeholder_val = f":val_{db_attr}"
                    
                    update_parts.append(f"{placeholder_name} = {placeholder_val}")
                    expr_names[placeholder_name] = db_attr
                    expr_vals[placeholder_val] = val
                    
            if not update_parts:
                return response(400, {'message': 'No properties provided for update.'})
                
            update_expr = "SET " + ", ".join(update_parts)
            bus_table.update_item(
                Key={'busId': bus_id},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_vals
            )
            
            # Publish SNS
            publish_sns("Bus Updated", f"Bus details updated successfully.\nBus ID: {bus_id}")
            
            return response(200, {'success': True, 'message': 'Bus configurations updated successfully.'})
            
        # ----------------------------------------------------
        # DELETE /deletebus
        # ----------------------------------------------------
        elif sub_path == "/deletebus" and http_method == 'DELETE':
            body = json.loads(event.get('body') or '{}')
            bus_id = body.get('busId') or body.get('id')
            
            if not bus_id:
                # check query params
                q_params = event.get('queryStringParameters') or {}
                bus_id = q_params.get('busId') or q_params.get('id')
                
            if not bus_id:
                return response(400, {'message': 'Missing busId parameters.'})
                
            # Delete bus from BusDetails
            bus_table = dynamodb.Table(BUSDETAILS_TABLE)
            bus_table.delete_item(Key={'busId': bus_id})
            
            # Fetch all seat mappings for bus route
            seats_table = dynamodb.Table(SEATS_TABLE)
            query_res = seats_table.query(
                KeyConditionExpression=Key('busId').eq(bus_id)
            )
            seats = query_res.get('Items', [])
            
            # Batch delete seats
            if seats:
                with seats_table.batch_writer() as batch:
                    for seat in seats:
                        batch.delete_item(Key={'busId': bus_id, 'seatNumber': seat.get('seatNumber')})
            logger.info(f"Deleted {len(seats)} seats for bus {bus_id}.")
            
            # Publish SNS
            publish_sns("Bus Deleted", f"Bus operator removed from system.\nBus ID: {bus_id}")
            
            return response(200, {'success': True, 'message': f'Bus {bus_id} and related seats deleted successfully.'})
            
        else:
            return response(404, {'message': f'Method {http_method} on path {path} not found.'})
            
    except ClientError as e:
        logger.error(f"AWS DynamoDB ClientError encountered: {e.response['Error']['Message']}", exc_info=True)
        return response(500, {'message': 'Database execution error.', 'details': e.response['Error']['Message']})
    except Exception as e:
        logger.error(f"General execution fail inside lambda_handler: {str(e)}", exc_info=True)
        return response(500, {'message': 'Server failure.', 'error': str(e)})
