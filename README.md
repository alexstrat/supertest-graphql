# supertest-graphql
<p>
  <a href="https://badge.fury.io/js/supertest-graphql"><img src="https://badge.fury.io/js/supertest-graphql.svg" alt="npm version" height="18"></a>
  <a href="#" target="_blank">
    <img alt="License: ISC" src="https://img.shields.io/badge/License-ISC-yellow.svg" />
  </a>
  <a href="https://github.com/intuit/auto"><img src="https://img.shields.io/badge/release-auto.svg?style=flat-square&colorA=888888&amp;colorB=9B065A&amp;label=auto&amp;logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAACzElEQVR4AYXBW2iVBQAA4O+/nLlLO9NM7JSXasko2ASZMaKyhRKEDH2ohxHVWy6EiIiiLOgiZG9CtdgG0VNQoJEXRogVgZYylI1skiKVITPTTtnv3M7+v8UvnG3M+r7APLIRxStn69qzqeBBrMYyBDiL4SD0VeFmRwtrkrI5IjP0F7rjzrSjvbTqwubiLZffySrhRrSghBJa8EBYY0NyLJt8bDBOtzbEY72TldQ1kRm6otana8JK3/kzN/3V/NBPU6HsNnNlZAz/ukOalb0RBJKeQnykd7LiX5Fp/YXuQlfUuhXbg8Di5GL9jbXFq/tLa86PpxPhAPrwCYaiorS8L/uuPJh1hZFbcR8mewrx0d7JShr3F7pNW4vX0GRakKWVk7taDq7uPvFWw8YkMcPVb+vfvfRZ1i7zqFwjtmFouL72y6C/0L0Ie3GvaQXRyYVB3YZNE32/+A/D9bVLcRB3yw3hkRCdaDUtFl6Ykr20aaLvKoqIXUdbMj6GFzAmdxfWx9iIRrkDr1f27cFONGMUo/gRI/jNbIMYxJOoR1cY0OGaVPb5z9mlKbyJP/EsdmIXvsFmM7Ql42nEblX3xI1BbYbTkXCqRnxUbgzPo4T7sQBNeBG7zbAiDI8nWfZDhQWYCG4PFr+HMBQ6l5VPJybeRyJXwsdYJ/cRnlJV0yB4ZlUYtFQIkMZnst8fRrPcKezHCblz2IInMIkPzbbyb9mW42nWInc2xmE0y61AJ06oGsXL5rcOK1UdCbEXiVwNXsEy/6+EbaiVG8eeEAfxvaoSBnCH61uOD7BS1Ul8ESHBKWxCrdyd6EYNKihgEVrwOAbQruoytuBYIFfAc3gVN6iawhjKyNCEpYhVJXgbOzARyaU4hCtYizq5EI1YgiUoIlT1B7ZjByqmRWYbwtdYjoWoN7+LOIQefIqKawLzK6ID69GGpQgwhhEcwGGUzfEPAiPqsCXadFsAAAAASUVORK5CYII=" alt="Auto Release" /></a>
</p>

> Extends [supertest](https://www.npmjs.com/package/supertest) to test a GraphQL endpoint

## Install

```sh
npm install supertest-graphql
```

## Usage

```ts
import request from 'supertest-graphql'
import gql from 'graphql-tag'

test('should get pets', async () => {
  const { data } = await request(app)
    .query(gql`
      query {
        pets {
          name
          petType
        }
      }
    `)
    .expectNoErrors()
  
  expect(data.pets).toHaveLength(2)
})
```

### Set expectations
`expectNoErrors` will verify that the API response has no `errors` in
its result payload.

```ts
await request(app)
  .query('blooop')
  .expectNoErrors()
  // expected no errors but got 1 error(s) in GraphQL response: Syntax Error: Unexpected Name "blooop".
```
### Variables
```ts
const { data } = await request(app)
  .query(gql`
    query GetPets($first: Int){
      pets(first: $first) {
        name
        petType
      }
    }
  `)
  .variables({ first: 4 })
```

### Mutation
```ts
const { data } = await request(app)
  .mutate(gql`
    mutation PetAnimal($petId: ID!) {
      petAnimal(petId: $petId) {
        name
        petType
      }
    }
  `)
  .variables({petId: 'my-cat' })
```

### Subscriptions with WebScoket
```ts
import { supertestWs } from 'supertest-graphql'
import gql from 'graphql-tag'

// for websocket the server needs to be started and stopped manually
beForeEach(() => server.listen(0, "localhost"))
afterEach(() => server.close())

test('should get pets', async () => {
  const sub = await supertestWs(app)
    .subscribe(gql`
      subscription {
        newPetAdded {
          name
          petType
        }
      }
    `)
  
  // will wait or pop the next value
  const { data } = await sub.next().expectNoErrors()

  expect(data.newPetAdded.name).toEqual('Fifi')
})
```

### Authentication
```ts
const { data } = await request(app)
  .auth('username', 'password')
  .query(...)
```

or via headers:
```ts
const { data } = await request(app)
  .set('authorization', 'my token')
  .query(...)
```

For WebSocket with `connectionParams`:
```ts
import { supertestWs } from 'supertest-graphql'

const sub = await supertestWs(app)
  .connectionParams({
    token: 'my token'
  })
  .subscribe(...)
```
### Change GraphQL endpoint path

By default, the execution are sent to `/graphql`.

You can change this with `.path()`:

```ts
const { data } = await request(app)
  .path('/new-graphql')
  .query(...)
```

### Use WebSocket legacy protocol

```ts
import { supertestWs, LEGACY_WEBSOCKET_PROTOCOL } from 'supertest-graphql'

const sub = await supertestWs(app)
  .protocol(LEGACY_WEBSOCKET_PROTOCOL)
  .subscribe(...)
```