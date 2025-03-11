import {runPegParser} from "../parser";
import path from "path";

const parserPath = path.join(__dirname, "../../parser/peg/parse.py");

test('parsing block', async () => {
  const result: any = await runPegParser({
    content: `
    #### comment
    Person: entity { 
      name: string # comment 
    }
    `,
    parserPath: parserPath
  });
  const first = result.tree[0];
  expect([
    first.name,
    first.type,
    first.value.name,
    first.blocks[0].name,
    first.blocks[0].value.name
    ],
    ).toEqual(["Person", "block", "entity", "name", "string"]);
});


//
// class Foo {
//   x = 1
//
//   foo = () => {
//     this.x;
//   }
//
//   bar = () => {
//     xx(this.foo)
//   }
// }
