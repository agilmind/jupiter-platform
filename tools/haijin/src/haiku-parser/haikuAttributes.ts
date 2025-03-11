import {LangLabelsType, OneLangLabel} from "./HaikuTypes";

export const getCalleeNamesChain = (value: any): any[] => {
  if (value.args) {
    return [value.callee.name, ...getCalleeNamesChain(value.args[0])];
  }
  return [value.name]
};

export const getCalleeChain = (value: any): any[] => {
  if (value.args) {
    if (value.args[0].args || value.args[0].name) {
      return [[value.callee.name, ...value.args.slice(1), ...value.kwargs], ...getCalleeChain(value.args[0])];
    } else {
      return [[value.callee.name, ...value.args]];
    }
  }
  return [value.name];
};

export const getAttributes = (value: any) => {
  const blockChain = getCalleeChain(value);
  const [argList, [type]] = [blockChain.slice(0, -1), blockChain.slice(-1)];
  let argPresence: any = argList.map(x => {return {[x[0]]: x.length > 1 ? x.slice(1).map((x: any)=>x.value) : true}});
  if (argPresence.length > 0) {
    argPresence = argPresence.reduce((x, y) => {return {...x, ...y}});
  }
  return [type, argPresence, argList];
};

export const getArgs = (attributeName: string, args: any[]) => {
  const argList = [];
  for (let i=0; i < args.length; i++) {
    if (args[i][0] === attributeName) {
      argList.push(args[i].slice(1).map((x: any)=>x.type === "identifier" ? x.name : x.type ? x.value : {[x.name]: x.value.elements}));
    }
  }
  if (argList.length === 1) {
    return argList[0];
  } else if (argList.length > 1) {
    return argList
  }
}

export function getLabels(labels: any[], defaultLanguage: string): LangLabelsType {
    function buildLangLabels(labelsObject: any) {
      const result: LangLabelsType = {};
      for (const [key, value] of Object.entries(labelsObject)) {
        let values: OneLangLabel = {s: "<undefined>"};
        if (Array.isArray(value) && value.length > 0) {
          values.s = value[0].value;
          if (value.length > 1) {
            values.p = value[1].value;
          }
          if (value.length > 2) {
            values.g = value[2].value;
          }
        }
        result[key] = values;
      }
      return result;
    }

    if (labels.length > 1 && typeof labels[0] === 'object' && labels[0]) {
      let langLabels: LangLabelsType = {};
      for (let label of labels) {
        langLabels = {...langLabels, ...buildLangLabels(label)}
      }
      return langLabels;
    }

    if (labels.length === 1) {
      return {[defaultLanguage]: {s: labels[0]}};
    } else if (labels.length === 2) {
      return {[defaultLanguage]: {s:labels[0], p: labels[1]}};
    }
    return {[defaultLanguage]: {s: "<undefined>"}};
  }

