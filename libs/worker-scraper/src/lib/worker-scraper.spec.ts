import { workerScraper } from './worker-scraper';

describe('workerScraper', () => {
  it('should work', () => {
    expect(workerScraper()).toEqual('worker-scraper');
  });
});
