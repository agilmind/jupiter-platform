"use strict";
// Este archivo exporta todas las implementaciones para facilitar las importaciones
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScraperFactory = exports.TextScraperHandler = exports.LightScraper = exports.BrowserScraper = exports.RotatingProxyManager = exports.PlaywrightPageInteractor = exports.CheerioContentExtractor = exports.DefaultTextProcessor = exports.PlaywrightBrowserProvider = void 0;
// Exportar proveedores y utilidades
var browser_provider_1 = require("./browser-provider");
Object.defineProperty(exports, "PlaywrightBrowserProvider", { enumerable: true, get: function () { return browser_provider_1.PlaywrightBrowserProvider; } });
var text_processor_1 = require("./text-processor");
Object.defineProperty(exports, "DefaultTextProcessor", { enumerable: true, get: function () { return text_processor_1.DefaultTextProcessor; } });
var content_extractor_1 = require("./content-extractor");
Object.defineProperty(exports, "CheerioContentExtractor", { enumerable: true, get: function () { return content_extractor_1.CheerioContentExtractor; } });
var page_interactor_1 = require("./page-interactor");
Object.defineProperty(exports, "PlaywrightPageInteractor", { enumerable: true, get: function () { return page_interactor_1.PlaywrightPageInteractor; } });
var proxy_manager_1 = require("./proxy-manager");
Object.defineProperty(exports, "RotatingProxyManager", { enumerable: true, get: function () { return proxy_manager_1.RotatingProxyManager; } });
// Exportar scrapers concretos
var browser_scraper_1 = require("./browser-scraper");
Object.defineProperty(exports, "BrowserScraper", { enumerable: true, get: function () { return browser_scraper_1.BrowserScraper; } });
var light_scraper_1 = require("./light-scraper");
Object.defineProperty(exports, "LightScraper", { enumerable: true, get: function () { return light_scraper_1.LightScraper; } });
// Exportar handlers
var text_scraper_handler_1 = require("../text-scraper-handler");
Object.defineProperty(exports, "TextScraperHandler", { enumerable: true, get: function () { return text_scraper_handler_1.TextScraperHandler; } });
var scraper_factory_1 = require("../scraper-factory");
Object.defineProperty(exports, "ScraperFactory", { enumerable: true, get: function () { return scraper_factory_1.ScraperFactory; } });
