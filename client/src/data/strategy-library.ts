export type StrategyComplexity = 'beginner' | 'intermediate' | 'advanced';

export interface StrategyDefinition {
  id: string;
  name: string;
  complexity: StrategyComplexity;
  summary: string;
  marketView: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  assignmentRisk: 'Low' | 'Medium' | 'High';
  keyMetrics: string[];
  legs: string[];
  exampleTicker: string;
  exampleNotes: string;
}

export const COMPLEXITY_LABELS: Record<StrategyComplexity, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const COMPLEXITY_DISPLAY_COUNTS: Record<StrategyComplexity, number> = {
  beginner: 6,
  intermediate: 14,
  advanced: 12,
};

export const STRATEGY_LIBRARY: StrategyDefinition[] = [
  {
    id: 'long-call',
    name: 'Long Call',
    complexity: 'beginner',
    summary: 'Buy a call option to capture upside moves with limited risk.',
    marketView: 'Forecast a strong bullish move or event-driven breakout.',
    riskLevel: 'Medium',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Max profit: unlimited',
      'Max loss: premium paid',
      'Primary Greeks: long delta, long vega'
    ],
    legs: [
      'Buy 1 call near-the-money with 30-60 DTE.'
    ],
    exampleTicker: 'AAPL $254.43 (+0.64%)',
    exampleNotes: 'Look for momentum plus rising implied volatility.'
  },
  {
    id: 'long-put',
    name: 'Long Put',
    complexity: 'beginner',
    summary: 'Buy a put to profit from bearish moves or protect existing stock.',
    marketView: 'Anticipate a breakdown or need tactical insurance.',
    riskLevel: 'Medium',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Max profit: to zero less premium',
      'Max loss: premium paid',
      'Primary Greeks: long vega, negative delta'
    ],
    legs: [
      'Buy 1 put at-the-money or slightly ITM with 30-60 DTE.'
    ],
    exampleTicker: 'MSFT $410.12 (-0.76%)',
    exampleNotes: 'Great for fast drops or as insurance on long shares.'
  },
  {
    id: 'covered-call',
    name: 'Covered Call',
    complexity: 'beginner',
    summary: 'Generate yield by selling calls against long stock positions.',
    marketView: 'Neutral to modestly bullish and comfortable with capped upside.',
    riskLevel: 'Low',
    assignmentRisk: 'High',
    keyMetrics: [
      'Max profit: stock appreciation to call strike + credit',
      'Max loss: downside of stock minus credit cushion',
      'Capital: 100 shares per contract'
    ],
    legs: [
      'Long 100 shares.',
      'Sell 1 call slightly out-of-the-money ~30-45 DTE.'
    ],
    exampleTicker: 'KO $58.32 (+0.38%)',
    exampleNotes: 'Pairs well with stable dividend names for monthly income.'
  },
  {
    id: 'cash-secured-put',
    name: 'Short Put (Cash-Secured)',
    complexity: 'beginner',
    summary: 'Collect premium while agreeing to buy shares at a lower strike.',
    marketView: 'Neutral to bullish with willingness to own the stock.',
    riskLevel: 'Low',
    assignmentRisk: 'High',
    keyMetrics: [
      'Max profit: premium received',
      'Max loss: strike - credit (per share)',
      'Collateral: strike x 100 must be reserved'
    ],
    legs: [
      'Sell 1 put 20-30 delta with 30-45 DTE and keep cash reserved.'
    ],
    exampleTicker: 'PG $153.44 (+0.56%)',
    exampleNotes: 'Great drill for acquiring quality names at attractive prices.'
  },
  {
    id: 'protective-put',
    name: 'Protective Put',
    complexity: 'beginner',
    summary: 'Purchase a put to create a floor beneath a long stock position.',
    marketView: 'Bullish longer term but concerned about near-term downside.',
    riskLevel: 'Low',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Max profit: unlimited with stock upside',
      'Max loss: stock basis - put strike + premium',
      'Acts like insurance with defined deductible'
    ],
    legs: [
      'Long 100 shares.',
      'Buy 1 put slightly OTM with 45-90 DTE.'
    ],
    exampleTicker: 'TSLA $238.12 (-1.70%)',
    exampleNotes: 'Useful around earnings or macro uncertainty to cap risk.'
  },
  {
    id: 'vertical-spreads-basic',
    name: 'Bull/Bear Call & Put Spreads',
    complexity: 'beginner',
    summary: 'Use vertical spreads to define risk on directional ideas.',
    marketView: 'Expect a moderate move toward a defined target.',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: strike width minus debit or retained credit',
      'Max loss: defined by strike width',
      'Capital efficient vs. buying naked options'
    ],
    legs: [
      'Debit version: buy option closer to the money, sell further out.',
      'Credit version: sell option closer to the money, buy tail protection.'
    ],
    exampleTicker: 'AMD $134.22 (+0.85%)',
    exampleNotes: 'Bread-and-butter structure for newer traders with small accounts.'
  },
  {
    id: 'call-calendar',
    name: 'Call Calendar Spread',
    complexity: 'intermediate',
    summary: 'Sell a near-term call and buy a longer-term call at the same strike to capture time decay while keeping upside optionality.',
    marketView: 'Neutral to slightly bullish with expectation of volatility staying firm.',
    riskLevel: 'Medium',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Max profit: near strike when short call expires',
      'Max loss: net debit paid',
      'Greeks: long vega, short theta in front month'
    ],
    legs: [
      'Sell 1 call 7-14 DTE at the chosen strike.',
      'Buy 1 call 45-60 DTE at the same strike.'
    ],
    exampleTicker: 'AAPL $254.43 (+0.64%)',
    exampleNotes: 'Great around earnings run-ups or when price is coiling.'
  },
  {
    id: 'put-calendar',
    name: 'Put Calendar Spread',
    complexity: 'intermediate',
    summary: 'Mirror of the call calendar using puts to lean gently bearish while harvesting theta.',
    marketView: 'Expect a controlled drift lower or want tactical protection with a credit offset.',
    riskLevel: 'Medium',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Max profit: at strike when short put expires',
      'Max loss: net debit',
      'Greeks: positive vega exposure'
    ],
    legs: [
      'Sell 1 put 7-14 DTE.',
      'Buy 1 put 45-60 DTE at the same strike.'
    ],
    exampleTicker: 'SPY $521.12 (-0.45%)',
    exampleNotes: 'Ideal after fast rallies when you expect consolidation.'
  },
  {
    id: 'diagonal-calendar',
    name: 'Diagonal Calendar Spread',
    complexity: 'intermediate',
    summary: 'Blend a calendar with a directional bias by using different strikes for the long and short options.',
    marketView: 'Expect a controlled move toward the long strike while financing the position with short premium.',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: occurs near long strike',
      'Max loss: net debit',
      'Flexible: can morph into vertical or ratio spreads'
    ],
    legs: [
      'Sell 1 near-term option slightly OTM in the target direction.',
      'Buy 1 longer-term option ITM/OTM to express bias.'
    ],
    exampleTicker: 'NVDA $884.25 (+1.39%)',
    exampleNotes: 'Excellent when you want covered call style income without owning stock.'
  },
  {
    id: 'iron-condor',
    name: 'Iron Condor',
    complexity: 'intermediate',
    summary: 'Sell an out-of-the-money call spread and put spread simultaneously to collect premium from range-bound markets.',
    marketView: 'Neutral and expecting volatility compression or sideways price action.',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: net credit received',
      'Max loss: wing width minus credit',
      'Probability: high when short strikes are wide'
    ],
    legs: [
      'Sell 1 put spread below price.',
      'Sell 1 call spread above price.'
    ],
    exampleTicker: 'IWM $206.40 (+0.41%)',
    exampleNotes: 'Take profits quickly (25-50% of credit) to avoid tail risk.'
  },
  {
    id: 'iron-butterfly',
    name: 'Iron Butterfly',
    complexity: 'intermediate',
    summary: 'Sell an at-the-money straddle and buy wings to cap risk for high-theta premium collection.',
    marketView: 'Expect price to pin near the current level into expiration with IV falling.',
    riskLevel: 'Medium',
    assignmentRisk: 'High',
    keyMetrics: [
      'Max profit: net credit at center strike',
      'Max loss: wing width minus credit',
      'Theta: very positive while price stays inside the tent'
    ],
    legs: [
      'Sell 1 ATM call and 1 ATM put.',
      'Buy protective wings beyond each short strike.'
    ],
    exampleTicker: 'QQQ $560.12 (+0.38%)',
    exampleNotes: 'Best in high IV regimes; exit early if price escapes the body.'
  },
  {
    id: 'standard-butterfly',
    name: 'Standard Butterfly',
    complexity: 'intermediate',
    summary: 'Debit payoff that profits if price gravitates toward a target strike by expiration.',
    marketView: 'Neutral but targeting a specific level (e.g., major technical zone).',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: occurs at body strike',
      'Max loss: net debit',
      'Breakeven: body ± net debit'
    ],
    legs: [
      'Buy lower wing option.',
      'Sell 2 options at the target strike.',
      'Buy upper wing option.'
    ],
    exampleTicker: 'META $512.73 (-0.36%)',
    exampleNotes: 'Great for pin plays near expiration or as a cheap lottery ticket.'
  },
  {
    id: 'long-condor',
    name: 'Long Condor',
    complexity: 'intermediate',
    summary: 'Debit version of the condor used when you expect a controlled move into a channel.',
    marketView: 'Trend continuation with limited volatility and clear support/resistance.',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: between the middle strikes',
      'Max loss: net debit',
      'Gamma: peaks when price enters the desired zone'
    ],
    legs: [
      'Buy lower call (or put) to anchor.',
      'Sell two middle options to form the body.',
      'Buy upper call (or put) to cap risk.'
    ],
    exampleTicker: 'BA $217.65 (+0.58%)',
    exampleNotes: 'Use after a breakout when you expect consolidation inside a range.'
  },
  {
    id: 'short-strangle',
    name: 'Short Strangle',
    complexity: 'intermediate',
    summary: 'Sell an OTM put and call to collect premium when expecting a wide, calm range.',
    marketView: 'Neutral with expectation of declining implied volatility.',
    riskLevel: 'High',
    assignmentRisk: 'High',
    keyMetrics: [
      'Max profit: premium received',
      'Max loss: theoretically unlimited',
      'Requires active risk management and hedging plan'
    ],
    legs: [
      'Sell 1 out-of-the-money put (delta ~0.10-0.20).',
      'Sell 1 out-of-the-money call (delta ~0.10-0.20).'
    ],
    exampleTicker: 'SPX 5235 (+0.24%)',
    exampleNotes: 'Close at 50% of credit; add wings if price runs to either side.'
  },
  {
    id: 'long-strangle',
    name: 'Long Strangle',
    complexity: 'intermediate',
    summary: 'Buy an out-of-the-money call and put to capture big moves in either direction.',
    marketView: 'Expect explosive movement or volatility expansion.',
    riskLevel: 'Medium',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Max profit: unlimited on both sides',
      'Max loss: combined premium',
      'Best when actual move exceeds implied move'
    ],
    legs: [
      'Buy 1 OTM call above resistance.',
      'Buy 1 OTM put below support.'
    ],
    exampleTicker: 'NFLX $612.88 (+1.43%)',
    exampleNotes: 'Frequently used before binary catalysts like earnings.'
  },
  {
    id: 'collar',
    name: 'Collar',
    complexity: 'intermediate',
    summary: 'Own stock, buy a protective put, and sell a call to finance the hedge.',
    marketView: 'Long-term bullish but wanting defined downside and willing to cap upside.',
    riskLevel: 'Low',
    assignmentRisk: 'High',
    keyMetrics: [
      'Max profit: call strike - stock basis + credit',
      'Max loss: put strike - stock basis - credit',
      'Cost: often near zero if structured well'
    ],
    legs: [
      'Long 100 shares.',
      'Buy 1 put below current price.',
      'Sell 1 call above current price.'
    ],
    exampleTicker: 'AMZN $178.34 (+0.63%)',
    exampleNotes: 'Convert protective puts into collars to reduce insurance cost.'
  },
  {
    id: 'long-straddle',
    name: 'Long Straddle',
    complexity: 'intermediate',
    summary: 'Buy an at-the-money call and put for maximum sensitivity to large moves.',
    marketView: 'Expect extreme movement and potential volatility surge.',
    riskLevel: 'Medium',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Max profit: unlimited both directions',
      'Max loss: total premium',
      'Breakeven: strike ± total debit'
    ],
    legs: [
      'Buy 1 ATM call.',
      'Buy 1 ATM put at the same strike and expiration.'
    ],
    exampleTicker: 'CRM $284.67 (+1.87%)',
    exampleNotes: 'Time entries so that the expected move exceeds implied move pricing.'
  },
  {
    id: 'calendar-ladder',
    name: 'Calendar Ladder',
    complexity: 'intermediate',
    summary: 'Layer multiple calendars around price to build a neutral, theta-positive structure.',
    marketView: 'Expect sideways action with pockets of volatility that can be harvested.',
    riskLevel: 'Medium',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Max profit: peaks near chosen strikes',
      'Max loss: cumulative debit',
      'Delivers steady theta with positive vega'
    ],
    legs: [
      'Sell 2-3 near-term options around current price.',
      'Buy matching longer-term options to anchor the structure.'
    ],
    exampleTicker: 'SPY $521.12 (+0.37%)',
    exampleNotes: 'Popular among income desks that manage neutral books.'
  },
  {
    id: 'diagonal-income',
    name: "Poor Man's Covered Call (Diagonal)",
    complexity: 'intermediate',
    summary: 'Use a deep ITM long call to mimic stock and sell shorter calls for recurring income.',
    marketView: 'Moderately bullish with desire for capital efficiency versus owning shares.',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: similar to covered call up to short strike',
      'Max loss: limited to long call cost minus credits',
      'Capital: fraction of stock price'
    ],
    legs: [
      'Buy 1 deep ITM call 60-120 DTE (delta 0.75+).',
      'Sell 1 short-term call (weekly or monthly) OTM for income.'
    ],
    exampleTicker: 'QQQ $560.12 (+0.38%)',
    exampleNotes: 'Roll short call aggressively to avoid unwanted assignment.'
  },
  {
    id: 'broken-wing-condor',
    name: 'Broken Wing Condor (Debit)',
    complexity: 'intermediate',
    summary: 'Shift one wing farther out to create a low-cost directional condor with defined risk.',
    marketView: 'Directional but wanting a safety net if trend stalls.',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: occurs near targeted side',
      'Max loss: reduced versus standard condor',
      'Often entered for very small debit or zero-cost'
    ],
    legs: [
      'Sell credit spread on favored side with standard width.',
      'Buy further OTM hedge on the opposite side to cheapen risk.'
    ],
    exampleTicker: 'XLF $42.18 (+0.29%)',
    exampleNotes: 'Go-to adjustment when one side of an iron condor is repeatedly challenged.'
  },
  {
    id: 'short-call-naked',
    name: 'Short Call (Naked)',
    complexity: 'advanced',
    summary: 'Sell an uncovered call for pure premium but with unlimited upside risk.',
    marketView: 'Strongly bearish/neutral with active hedging ability and ample margin.',
    riskLevel: 'High',
    assignmentRisk: 'High',
    keyMetrics: [
      'Max profit: premium received',
      'Max loss: unlimited above short strike',
      'Requires portfolio margin or offsetting hedges'
    ],
    legs: [
      'Sell 1 call (often slightly OTM) with strict risk controls.'
    ],
    exampleTicker: 'TSLA $238.12 (-1.70%)',
    exampleNotes: 'Only for desks that can delta hedge intraday or cap risk with long calls.'
  },
  {
    id: 'short-straddle',
    name: 'Short Straddle',
    complexity: 'advanced',
    summary: 'Sell an at-the-money call and put to maximize theta; requires constant monitoring.',
    marketView: 'Expect extremely low realized volatility and a price pin near strike.',
    riskLevel: 'High',
    assignmentRisk: 'High',
    keyMetrics: [
      'Max profit: premium received',
      'Max loss: unlimited both directions',
      'Demanding on capital and mental bandwidth'
    ],
    legs: [
      'Sell 1 ATM call.',
      'Sell 1 ATM put.'
    ],
    exampleTicker: 'SPX 5235 (+0.24%)',
    exampleNotes: 'Often paired with futures hedges or converted to iron fly once profitable.'
  },
  {
    id: 'unbalanced-butterfly',
    name: 'Unbalanced Butterfly',
    complexity: 'advanced',
    summary: 'Modify wing counts to skew payoff toward one side while collecting credit.',
    marketView: 'Neutral-to-directional with desire to lean into implied skew.',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: biased toward heavier wing side',
      'Max loss: defined but uneven',
      'Credit received: typically small but provides cushion'
    ],
    legs: [
      'Buy 1 lower wing.',
      'Sell 2-3 body options.',
      'Buy 1 upper wing (different distance).'
    ],
    exampleTicker: 'NVDA $884.25 (+1.39%)',
    exampleNotes: 'Common follow-up after adjusting an iron condor that keeps getting hit.'
  },
  {
    id: 'broken-wing-butterfly',
    name: 'Broken Wing Butterfly',
    complexity: 'advanced',
    summary: 'Shift one wing to remove risk on a preferred side, creating cheap or credit entries.',
    marketView: 'Directional neutral with preference to avoid risk on one tail.',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: near body strike',
      'Max loss: reduced on chosen side',
      'Often entered for even or small credit'
    ],
    legs: [
      'Buy closer wing on protected side.',
      'Sell two body options at target level.',
      'Buy far wing on risk side (wider).'
    ],
    exampleTicker: 'AAPL $254.43 (+0.64%)',
    exampleNotes: 'Useful when you expect drift but want almost no risk on one tail.'
  },
  {
    id: 'unbalanced-condor',
    name: 'Unbalanced Condor',
    complexity: 'advanced',
    summary: 'Adjust wing widths or contract quantities to lean directional while selling two spreads.',
    marketView: 'Neutral with a preferred side and desire to exploit skew.',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: net credit',
      'Max loss: wider wing minus credit',
      'Delta bias built-in for tactical positioning'
    ],
    legs: [
      'Sell 1 put spread with narrower distance.',
      'Sell 1 call spread with wider wings to allow room.'
    ],
    exampleTicker: 'RUT 2050 (+0.42%)',
    exampleNotes: 'A go-to adjustment when one side of a condor is repeatedly tested.'
  },
  {
    id: 'call-ratio-spread',
    name: 'Call Ratio Spread',
    complexity: 'advanced',
    summary: 'Sell more calls than bought to finance the trade while keeping unlimited risk above the upper strike.',
    marketView: 'Expect a modest rise but prepared to hedge if breakout accelerates.',
    riskLevel: 'High',
    assignmentRisk: 'High',
    keyMetrics: [
      'Max profit: between long and short strikes',
      'Max loss: unlimited above short strikes',
      'Margin: significant due to naked exposure'
    ],
    legs: [
      'Buy 1 call closer to the money.',
      'Sell 2 calls further out (same expiry).'
    ],
    exampleTicker: 'AMD $134.22 (+0.85%)',
    exampleNotes: 'Add an extra long call to convert into a butterfly if price rips higher.'
  },
  {
    id: 'call-backspread',
    name: 'Call Backspread',
    complexity: 'advanced',
    summary: 'Buy extra calls financed with a short call to profit from explosive rallies.',
    marketView: 'Strongly bullish with expectation of large upside surprise.',
    riskLevel: 'Medium',
    assignmentRisk: 'Medium',
    keyMetrics: [
      'Max profit: unlimited on big upside moves',
      'Max loss: limited between strikes',
      'Constructed for positive gamma and vega'
    ],
    legs: [
      'Sell 1 lower strike call.',
      'Buy 2 higher strike calls (same expiry).'
    ],
    exampleTicker: 'SMH $210.55 (+1.18%)',
    exampleNotes: 'Pair with event catalysts when implied move looks understated.'
  },
  {
    id: 'double-diagonal',
    name: 'Double Diagonal',
    complexity: 'advanced',
    summary: 'Place calendar spreads on both sides with different strikes to manage theta and vega on a neutral book.',
    marketView: 'Expect price to oscillate inside a corridor while volatility mean reverts.',
    riskLevel: 'Medium',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Max profit: occurs near short strikes at front expiration',
      'Max loss: net debit plus adjustments',
      'Positive theta and vega as long as price stays centered'
    ],
    legs: [
      'Sell 1 near-term call and buy a longer-dated call further OTM.',
      'Sell 1 near-term put and buy a longer-dated put further OTM.'
    ],
    exampleTicker: 'SPY $521.12 (+0.37%)',
    exampleNotes: 'Professional favorite for balancing weekly theta harvest with tail protection.'
  },
  {
    id: 'double-calendar',
    name: 'Double Calendar',
    complexity: 'advanced',
    summary: 'Run calendar spreads on both sides of price to create a symmetric tent that benefits from decay.',
    marketView: 'Neutral with expectation of the underlying oscillating between two levels.',
    riskLevel: 'Medium',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Max profit: between calendar strikes',
      'Max loss: net debit',
      'Positive theta with modest positive vega'
    ],
    legs: [
      'Sell near-term call and put around current price.',
      'Buy longer dated call and put at same strikes.'
    ],
    exampleTicker: 'QQQ $560.12 (+0.38%)',
    exampleNotes: 'Manage by rolling the threatened short leg to re-center the tent.'
  },
  {
    id: 'synthetic-long',
    name: 'Synthetic Long',
    complexity: 'advanced',
    summary: 'Combine a long call and short put at the same strike/expiry to replicate long stock.',
    marketView: 'Strong bullish conviction with desire for capital efficiency.',
    riskLevel: 'High',
    assignmentRisk: 'High',
    keyMetrics: [
      'Max profit: unlimited',
      'Max loss: substantial (like owning stock)',
      'Delta: approximately +1'
    ],
    legs: [
      'Buy 1 ATM call.',
      'Sell 1 ATM put.'
    ],
    exampleTicker: 'GOOGL $178.35 (+0.70%)',
    exampleNotes: 'Monitor margin closely; roll put lower if price dives.'
  },
  {
    id: 'synthetic-short',
    name: 'Synthetic Short',
    complexity: 'advanced',
    summary: 'Sell a call and buy a put at the same strike to mimic short stock exposure.',
    marketView: 'Strong bearish conviction without borrowing shares.',
    riskLevel: 'High',
    assignmentRisk: 'High',
    keyMetrics: [
      'Max profit: stock to zero minus debit',
      'Max loss: unlimited above short call',
      'Delta: approximately -1'
    ],
    legs: [
      'Sell 1 ATM call.',
      'Buy 1 ATM put.'
    ],
    exampleTicker: 'NVDA $884.25 (-1.72%)',
    exampleNotes: 'Treat like a short stock position; hedge with calls if move accelerates.'
  },
  {
    id: 'box-spread',
    name: 'Box Spread',
    complexity: 'advanced',
    summary: 'Combine a bull call spread and bear put spread to lock in a risk-free interest-rate style payoff.',
    marketView: 'Market neutral arbitrage used to synthetically lend or borrow capital.',
    riskLevel: 'Low',
    assignmentRisk: 'Low',
    keyMetrics: [
      'Profit: difference between strike widths versus net debit/credit',
      'Risk: theoretical zero if executed perfectly',
      'Requires European-style options to avoid early assignment risk'
    ],
    legs: [
      'Buy lower call / sell higher call (bull call spread).',
      'Sell lower put / buy higher put (bear put spread).'
    ],
    exampleTicker: 'SPX 5235 (+0.24%)',
    exampleNotes: 'Mostly institutional strategy to capture rate differentials.'
  },
];

export const STRATEGY_LOOKUP = new Map<string, StrategyDefinition>(
  STRATEGY_LIBRARY.map((strategy) => [strategy.id, strategy])
);

export const COMPLEXITY_GROUPED: Record<StrategyComplexity, StrategyDefinition[]> = {
  beginner: STRATEGY_LIBRARY.filter((strategy) => strategy.complexity === 'beginner'),
  intermediate: STRATEGY_LIBRARY.filter((strategy) => strategy.complexity === 'intermediate'),
  advanced: STRATEGY_LIBRARY.filter((strategy) => strategy.complexity === 'advanced'),
};
