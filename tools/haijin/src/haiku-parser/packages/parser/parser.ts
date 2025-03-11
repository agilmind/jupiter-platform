import * as dotenv from "dotenv";
import { PythonShell } from "python-shell";

type Params = {
  parserPath: string;
  content: string;
  pythonPath?: string;
};

export const runPegParser = async ({ parserPath, content, pythonPath = getPythonPath() }: Params): Promise<any> =>
  new Promise((resolve, reject) => {
    const pyshell = new PythonShell(parserPath, {
      pythonPath,
      mode: "text" as const,
      pythonOptions: ["-u"],
      args: ["-"],
    });
    pyshell.send(content);

    let result = "";
    pyshell.on("message", (message) => {
      result += message;
    });

    pyshell.end(function (err) {
      if (err) {
        reject(err);
      } else {
        try {
          resolve(JSON.parse(result));
        } catch (error) {
          reject(error);
        }
      }
    });
  });

export const getPythonPath = () => {
  dotenv.config()
  let pythonPath = process.env.PYTHON_PATH;
  if (!pythonPath) {
    dotenv.config({path:__dirname + "/.env"})
    pythonPath = process.env.PYTHON_PATH;
    if (!pythonPath) {
      throw new Error("Create a .env file in the root folder with a PYTHON_PATH variable!");
    }
  }
  return pythonPath;
};


// runPegParser({
//   content: 'from "foo" import Bar, Baz\nPerson: entity { name: string }',
//   parserPath: "./peg/parse.py",
// }).catch(error => console.error(error)).then(result => console.log(JSON.stringify(result, null, 2)));
