/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| This file is dedicated for defining HTTP routes. A single file is enough
| for majority of projects, however you can define routes in different
| files and just make sure to import them inside this file. For example
|
| Define routes in following two files
| ├── start/routes/cart.ts
| ├── start/routes/customer.ts
|
| and then import them inside `start/routes.ts` as follows
|
| import './routes/cart'
| import './routes/customer'
|
*/

import { HttpContext } from '@adonisjs/core/build/standalone';
import Route from '@ioc:Adonis/Core/Route';
import Env from '@ioc:Adonis/Core/Env';
import { LabelCreatedEvent } from '@octokit/webhooks-types';
import crypto from 'crypto';

Route.get('/', async () => {
  return { hello: 'world' };
});

Route.post('/webhook', async ({ request }: HttpContext) => {
  console.log({
    action: request.body().action,
  });
  const signature = request.header('x-hub-signature-256');
  verifySignature(JSON.stringify(request.body()), signature || '');
  if (request.body().action === 'labeled') {
    const payload = request.body() as LabelCreatedEvent;
    console.log(payload);
  }
  return {
    message: 'Well, done!',
  };
});

function verifySignature(payloadBody: string, headerSignature: string) {
  const SECRET_TOKEN = Env.get('APP_KEY');
  const signature =
    'sha256=' + crypto.createHmac('sha256', SECRET_TOKEN).update(payloadBody).digest('hex');
  if (
    !headerSignature ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(headerSignature))
  ) {
    throw new Error("Signatures didn't match!");
  }
}
