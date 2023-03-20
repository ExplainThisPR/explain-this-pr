import { https } from 'firebase-functions';

/**
 * Set the header config necessary to allow CORS request
 * @param req The request object
 * @param res The response object
 * @returns Whether the request is pre-flight
 */
export const allowCors = (req: https.Request, res: any) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  if (req.method === 'OPTIONS') {
    /* handle preflight OPTIONS request */

    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // cache preflight response for 3600 sec
    res.set('Access-Control-Max-Age', '3600');

    res.sendStatus(204);
    return true;
  }

  return false;
};
