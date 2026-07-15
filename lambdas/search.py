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

BUSDETAILS_TABLE = 'BusDetails'

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            # Convert decimal to float or int
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
        table = dynamodb.Table(BUSDETAILS_TABLE)
        method = event.get('httpMethod')
        
        # 1. Handle GET /buses (Read all buses)
        if method == 'GET':
            logger.info("Fetching all buses from BusDetails...")
            response = table.scan()
            buses = response.get('Items', [])
            
            # Format and convert Decimals to JSON types
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(buses, cls=DecimalEncoder)
            }
            
        # 2. Handle POST /search (Search buses by route)
        elif method == 'POST':
            body = json.loads(event.get('body', '{}'))
            from_city = body.get('fromCity', '').strip()
            to_city = body.get('toCity', '').strip()
            journey_date = body.get('travelDate', '').strip()
            
            if not from_city or not to_city:
                return {
                    'statusCode': 400,
                    'headers': headers,
                    'body': json.dumps({'message': 'Missing fromCity or toCity parameters'})
                }
                
            logger.info(f"Searching buses from '{from_city}' to '{to_city}' for date '{journey_date}'...")
            
            # Read from BusDetails
            response = table.scan()
            buses = response.get('Items', [])
            
            # Filter buses matching route case-insensitively
            matched_buses = []
            for b in buses:
                if (b.get('fromCity', '').lower() == from_city.lower() and 
                    b.get('toCity', '').lower() == to_city.lower() and
                    b.get('status', 'ACTIVE') != 'INACTIVE'):
                    matched_buses.append(b)
                    
            logger.info(f"Found {len(matched_buses)} matched buses.")
            
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(matched_buses, cls=DecimalEncoder)
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
            'body': json.dumps({'message': 'Internal Server Error. DynamoDB read failed.'})
        }
    except Exception as e:
        logger.error(f"General Execution Failure: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': f'Server failure: {str(e)}'})
        }
