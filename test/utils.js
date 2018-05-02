import config from 'config';
import debug from 'debug';
import nock from 'nock';
import Promise from 'bluebird';
import Stripe from 'stripe';
import { graphql } from 'graphql';
import { isArray, values } from 'lodash';

import * as db_restore from '../scripts/db_restore';
import schema from '../server/graphql/schema';
import { loaders } from '../server/graphql/loaders';
import { sequelize } from '../server/models';
import userlib from '../server/lib/userlib';

import jsonData from './mocks/data';

const appStripe = Stripe(config.stripe.secret);

if (process.env.RECORD) {
  nock.recorder.rec();
}

jsonData.application = { name: 'client', api_key: config.keys.opencollective.api_key };

export const data = (item) => {
  const copy = Object.assign({}, jsonData[item]); // to avoid changing these data
  return (isArray(jsonData[item])) ? values(copy) : copy;
}

export const clearbitStubBeforeEach = sandbox => {
  sandbox.stub(userlib.clearbit.Enrichment, 'find', () => {
    return Promise.reject(new userlib.clearbit.Enrichment.NotFoundError());
  });
};

export const clearbitStubAfterEach = (sandbox) => sandbox.restore();

export const resetTestDB = () => sequelize.sync({force: true})
  .catch(e => {
    console.error("test/utils.js> Sequelize Error: Couldn't recreate the schema", e);
    process.exit(1);
  });

export async function loadDB(dbname) {
  await db_restore.main({ force: true, file: dbname });
}

export const stringify = (json) => {
  return JSON.stringify(json, null, '>>>>').replace(/\n>>>>+"([^"]+)"/g,'$1').replace(/\n|>>>>+/g,'')
}

export const makeRequest = (remoteUser, query) => {
  return {
    remoteUser,
    body: { query },
    loaders: loaders({ remoteUser })
  }
}

export const inspectSpy = (spy, argsCount) => {
  for (let i=0; i <  spy.callCount; i++) {
    console.log(`>>> spy.args[${i}]`,  { ...spy.args[i].slice(0, argsCount)});
  }
}

/**
 * Wait for condition to be met
 * E.g. await waitForCondition(() => emailSendMessageSpy.callCount === 1)
 * @param {*} cond
 * @param {*} options: { timeout, delay }
 */
export const waitForCondition = (cond, options = { timeout: 10000, delay: 0 }) => new Promise(resolve => {
  let hasConditionBeenMet = false;
  setTimeout(() => {
    if (hasConditionBeenMet) return;
    console.log(">>> waitForCondition Timeout Error");
    console.trace();
    throw new Error("Timeout waiting for condition", cond);
  }, options.timeout || 10000);
  const isConditionMet = () => {
    hasConditionBeenMet = Boolean(cond());
    if (options.tag) {
      console.log(new Date().getTime(), ">>> ", options.tag, "is condition met?", hasConditionBeenMet);
    }
    if (hasConditionBeenMet) {
      return setTimeout(resolve, options.delay || 0);
    } else {
      return setTimeout(isConditionMet, options.step || 100);
    }
  }
  isConditionMet();
});

export const graphqlQuery = async (query, variables, remoteUser) => {

  const prepare = () => {
    if (remoteUser) {
      remoteUser.rolesByCollectiveId = null; // force refetching the roles
      return remoteUser.populateRoles();
    } else {
      return Promise.resolve();
    }
  }

  if (process.env.DEBUG && process.env.DEBUG.match(/graphql/)) {
    debug('graphql')("query", query);
    debug('graphql')("variables", variables);
    debug('graphql')("context", remoteUser);
  }

  return prepare()
    .then(() => graphql(
      schema,
      query,
      null, // rootValue
      makeRequest(remoteUser, query), // context
      variables
    ));
}

export const createStripeToken = async () => {
    return appStripe.tokens.create({
      card: {
        number: '4242424242424242',
        exp_month: 12,
        exp_year: 2028,
        cvc: 222
      }
    })
    .then(st => st.id);
}
