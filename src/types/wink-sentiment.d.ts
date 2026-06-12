declare module "wink-sentiment" {
  interface TokenizedItem {
    value: string;
    tag: string;
  }

  interface SentimentOutput {
    score: number;
    normalizedScore: number;
    tokenizedPhrase: TokenizedItem[];
  }

  function sentiment(text: string): SentimentOutput;
  export default sentiment;
}
