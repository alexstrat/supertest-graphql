# supertest-graphql
<p>
  <a href="https://badge.fury.io/js/supertest-graphql"><img src="https://badge.fury.io/js/supertest-graphql.svg" alt="npm version" height="18"></a>
  <a href="#" target="_blank">
    <img alt="License: ISC" src="https://img.shields.io/badge/License-ISC-yellow.svg" />
  </a>
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
### Change GraphQL endpoint path

By dfault, the execution are sent to `/graphql`.

You can change this with `.path()`:

```ts
const { data } = await request(app)
  .path('/new-graphql')
  .query(...)
```





