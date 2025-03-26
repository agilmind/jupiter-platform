"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheerioContentExtractor = void 0;
const cheerio = __importStar(require("cheerio"));
class CheerioContentExtractor {
    extract(html, selector) {
        const $ = cheerio.load(html);
        if (selector) {
            const elements = $(selector);
            if (elements.length === 0) {
                // Si no hay elementos con ese selector, usar todo el contenido
                return {
                    text: $('body').text().trim(),
                    extractedHtml: $('body').html() || ''
                };
            }
            else {
                return {
                    text: elements.text().trim(),
                    extractedHtml: elements.html() || ''
                };
            }
        }
        else {
            // Sin selector, extraer todo el texto
            return {
                text: $('body').text().trim(),
                extractedHtml: $('body').html() || ''
            };
        }
    }
}
exports.CheerioContentExtractor = CheerioContentExtractor;
