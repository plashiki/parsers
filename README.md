# PlaShiki parsers
Parser is a small piece of code that serves exactly one purpose -- do automatic
tasks.

There are 3 types of parsers: Importers, Mappers and Cleaners:

 - Importers are run on a schedule a few times a day and import translations 
   from some services 
 - Mappers are run on a schedule a few times a week and create mappings between
   IDs on other services and IDs on MAL (ones we use internally)
 - Cleaners are run on a schedule every day and remove old/broken/banned
   translation. Due to their nature, to run them locally you'll
   actually need a running instance of PlaShiki backend.

# Building
```bash
yarn
cp .env.example .env
# fill values in .env 
yarn build
```

# Running
First, you will need Node >= 14.

To run a parser, you first should build the TypeScript files, 
then you should change `DEBUGGING` variable in `.env` file and
then run
```
node dist/engine/index.js
```
However, you'd better use Parser DevTools

# Structure
A parser is a file, which basically contains one/two exports:

## Entry point
```typescript
export function entry(ctx: ParserContext)
```
This is the heart of your parser. Due to the nature of our compiling system,
everything outside `entry` function will not end up in resulting script
when deploying, so think about `entry` function scope as a root scope.
It can return basically anything.

## Provide
```typescript
export const provide = ['dependency-id']
```
Provide is a list of dependencies that a parser uses. All of them (if available)
will end up in `ctx.deps`.

When importing a parser, you actually ask engine to call its function and receive
value which it returns. So, for example:
```typescript
// dep.ts
export function entry () { return 42 }

// a.ts
export const provide = ['dep']
export function entry (ctx: ParserContext) {
    let a = ctx.deps['dep']
    // a = 42
}
```

## Naming
When naming a parser, we try to keep some abstraction. 
Common utils like adapters or helper functions all go in `common/` group.

We have a few types of parsers, so they all go in their 
own group automatically (`importers/`, `mappers/`, `cleaners/`). 

**Importers** often have grouping by service which they import from.
So, let's say there's a service called `BaceFook`. Abstraction that takes
items from `BaceFook` should be in `services/bacefook` and all importers
that use it should be in `importers/bacefook/group-name`, 
where `group-name` is a kebab-cased (when possible) name of a group/user 
which is being parsed there.


# Parser DevTools
Preferred way to run a parser locally is to use Web-based DevTools.
To start it, use 
```
npm run dev
```
which will start a web app at https://127.0.0.1:6217. Or, you can
specify a port yourself:
```
PORT=1234 npm run dev
```
There, you will find a few buttons, fields and a large log window.
Log window is basically stdout & stderr from server file and all its child
processes, just like a normal read-only terminal tool.

To run a parser, press the `Compile` button, wait until it says `Compiled`, then
put name of the parser in `Parser name` field and press `Run`. `Create` button
will (surprisingly) create a new parser with a given name, and will 
populate dependencies if name follows convention.

There are also a few useful utils built-in, which all share same input field
and output stuff in log.
 - Anitomy will take input as a filename and print result of `anitomy` parse
 - Names will take input as a link to page and print names of videos there.
   - For VK it is: `vk.com/video%OWNERID%`
   - You can also use `page=N` & `count=N` (where supported) on a separate line
     to do pagination.


# Licensing
PlaShiki Parsers Engine (all files and folders in this repository
except [`src`](./src) folder and its files/subfolders) is distributed under GPLv3 license. 
You can find terms and conditions in [LICENSE](./LICENSE) file.

PlaShiki Parsers (all files and subfolders in [`src`](./src) folder) are licensed under
GPLv3 license UNLESS ANOTHER LICENSE IS EXPLICITLY STATED INSIDE THE FILE.
