import * as fs from "fs-extra";
import * as path from "path";
import {runPegParser} from "./packages/parser/parser";
import {Haiku} from "./Haiku";

export type ParseHaikuProjectArgs = {
  haikuDir: string;
};

const parserPath = path.join(__dirname, "../../packages/parser/peg/parse.py");
export const parseHaikuProject = async (args: ParseHaikuProjectArgs) => {
  const {
    haikuDir,
  } = args;
  const haikuConfigText = await fs.readFile(path.join(path.resolve(haikuDir), "hkconfig.json"), 'utf8');
  const haikuConfigData = JSON.parse(haikuConfigText);
  const haikuSources = [];
  for (let file of haikuConfigData.sources) {
    haikuSources.push(await fs.readFile(path.join(haikuDir, file), 'utf8'));
  }
  const parsed: {tree: any[], blocks: any[], imports: any[]} = await runPegParser({
    content: haikuSources.join("\n"),
    parserPath: parserPath,
  });

  return new Haiku(parsed, haikuConfigData);
};
