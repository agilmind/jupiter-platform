import {
    BlocksType,
    HaikuImplementedLangs,
    HaikuMenu,
    HaikuMenuDivider,
    HaikuMenuItem,
    LangLabelsType, UsedIcons
} from "./HaikuTypes";
import {getArgs, getAttributes, getLabels} from "./haikuAttributes";
import {completeLangs} from "./Haiku";
import * as _ from "lodash";

export type MenuItem = HaikuMenuItem | HaikuMenu | HaikuMenuDivider;

function addMenuIcon(menuId: string, usedIcons: UsedIcons, iconName?: string) {
    if (iconName && iconName[0] !== "#") {
      if (!usedIcons[menuId]) {
        usedIcons[menuId] = [];
      }
      usedIcons[menuId].push(iconName);
    }
}
export function getMenu(
    block: BlocksType,
    menuId: string[],
    languages: HaikuImplementedLangs[],
    defaultLanguage: HaikuImplementedLangs,
    usedIcons: UsedIcons,
    ): MenuItem {
    let [type, argPresence, argList] = getAttributes(block.value);
    let labels: undefined | LangLabelsType;
    if (argPresence.labels) {
      labels = completeLangs(getLabels(getArgs("labels", argList), defaultLanguage),
          languages, "Menu item");
    } else {
      labels = completeLangs({}, languages, "Menu item")
    }
    let args: any;
    if (argPresence.args) {
      let [[_, ...menuArgs]] = argList.filter((x: any[])=>x[0]==="args");
      args = menuArgs.map((x: any)=> {
        const json = JSON.parse(x.value.value);
        return {[x.name]: json}
      });
    }
    const iconName = argPresence.icon ? argPresence.icon[0] : undefined;
    if (!block.blocks || block.blocks.length === 0) {
      if (type === "divider") {
        addMenuIcon("MainMenu", usedIcons,"__divider__");
        return {
                id: `${menuId.join(".")}`,
                icon: "__divider__",
                labels,
            };
      } else {
        addMenuIcon("MainMenu", usedIcons, iconName);
        return {
                name: argPresence.name ? argPresence.name[0] : undefined,
                id: `${menuId.join(".")}`,
                url: argPresence.url[0],
                args: args,
                icon: iconName,
                labels,
                permission: argPresence.permission ? argPresence.permission[0] : null,
            };
      }
    } else {
        let menuItems: (HaikuMenuItem | HaikuMenu | HaikuMenuDivider)[] = [];
        let count = 1;
        addMenuIcon("MainMenu", usedIcons, iconName);
        for (const blockItem of block.blocks) {
            const parentName = [...menuId, count.toString()];
            count++;
            const menuItem = getMenu(blockItem, parentName, languages, defaultLanguage, usedIcons);
            menuItems.push(menuItem);
        }
        return {
                name: block.name,
                labels,
                items: menuItems,
                id: block.name,
                icon: iconName
            };
    }
}
