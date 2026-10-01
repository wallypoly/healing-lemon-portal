// 大众塔罗直觉连结 · 4 张牌 (A/B/C/D)
// 文案与牌面沿用现有工作坊表单，保持一致。
module.exports = [
  {
    key: 'tower',
    id: 'A',
    name: 'A ｜ 高塔 The Tower',
    title: '高塔 The Tower',
    img: '/assets/cards/the_tower.svg',
    text: `最近的你，可能经历了一些突然的变化。这些变化来得很快，快到你还没反应过来，事情就已经发生了。

高塔牌里的高塔看似坚固，但是还是抵挡不过突如其来的雷劈崩塌。这其实在说你一直以为很稳的东西，忽然开始摇晃。它或许是一段关系、一个环境，或者是某个你从来没有怀疑过的信念。

我相信这件事情“倒下”的时候，一定很吓人，也很震惊。因为你根本就不知道接下来会变成什么样子。

但你也要知道，一件事会塌下来，是因为它已经到了撑不住阶段。那个旧的框架，已经装不下现在的你了。

如果现在的你，还在混乱里，还不知道下一步该怎么走。

那就先不要走。让该倒的倒完，让该散的散掉。不用急着一定要马上站起来，也不用急着看清楚。

等一切沉淀下来，尘埃落定之后，你会慢慢发现有些东西虽然不在了，但那也是你第一次，真正有机会决定，自己想要什么样的生活。

English

You may have experienced sudden changes recently, so quickly that you barely had time to react. The Tower looks solid, yet it cannot withstand the sudden strike of lightning. Something you believed to be stable — a relationship, an environment, or a belief — has begun to shake.

When something falls, it is frightening. But it falls because it could no longer hold. The old framework can no longer contain who you are now.

If you are still in the chaos and do not know the next step — then do not take one yet. Let what must fall, fall. Let what must散, dissolve.

When everything settles, you will realise that although some things are gone, this is the first time you truly get to decide what kind of life you want.`,
  },
  {
    key: 'sun',
    id: 'B',
    name: 'B ｜ 太阳 The Sun',
    title: '太阳 The Sun',
    img: '/assets/cards/the_sun.svg',
    text: `抽到太阳牌的你，正在被一种很温暖的能量照顾着。

太阳牌是塔罗里最明亮的一张牌。它说的是简单、坦然、可以放心去做自己的那种状态。也许最近的你开始觉得事情慢慢顺起来了，也许你只是终于愿意对自己好一点。

牌里的小孩什么都没穿，不是因为不懂事，而是因为他不需要伪装。马没有缰绳，代表现在推动你的不是压力，是你自己的意愿。

所以不用把事情想得太复杂。你想要的东西，其实没有那么远。你只要允许自己开心，允许事情顺利，允许自己被爱。

English

The Sun is the brightest card in the tarot. It speaks of simplicity, ease, and the freedom to be yourself. Perhaps things have started to flow, or perhaps you have finally decided to be kind to yourself.

The child rides without reins — what moves you now is not pressure, but your own willingness.

So do not overcomplicate things. What you want is not that far away. Allow yourself to be happy, allow things to go well, allow yourself to be loved.`,
  },
  {
    key: 'judgement',
    id: 'C',
    name: 'C ｜ 审判 Judgement',
    title: '审判 Judgement',
    img: '/assets/cards/judgement.svg',
    text: `审判牌来到你面前，代表一个「醒来」的时刻。

不是谁来审判你，而是你开始听见那个一直在呼唤你的声音。可能是某个你压抑很久的念头，可能是某个你一直不敢承认的渴望。

牌里的人都从棺木里起身，向着天使的声音张开双手。那是一种愿意被重新开始的勇气。

过去的你可能做过一些选择，也可能错过一些机会。但审判牌告诉你：现在还不晚。你不需要等谁原谅你，你只需要自己站起来，往前走一步。

English

Judgement marks a moment of awakening. No one is judging you — you are beginning to hear the voice that has been calling you all along. Perhaps a thought you suppressed, or a desire you never dared admit.

The figures rise from their coffins with open hands toward the angel's call. It is the courage to allow yourself to begin again.

You may have made choices or missed chances. Judgement tells you: it is not too late. You do not need anyone's forgiveness. Just stand up and take one step forward.`,
  },
  {
    key: 'star',
    id: 'D',
    name: 'D ｜ 星星 The Star',
    title: '星星 The Star',
    img: '/assets/cards/the_star.svg',
    text: `星星牌是黑夜过后，那一点点光。

它不一定很亮，但它一直在。抽到这张牌的你，可能正在一个疗愈的过程里，可能刚从一段很累的日子走出来。你不需要立刻变得很厉害，你只需要继续相信。

牌里的女子把水倒进池子里，也倒进陆地上。她在滋养自己，也在滋养世界。这代表你现在的温柔，不只是对自己有用，也会影响到身边的人。

所以请继续走下去。你的方向是对的。

English

The Star is the small light after the dark. It may not be bright, but it is always there. If you drew this card, you may be in a process of healing, or just coming out of an exhausting season. You do not need to become extraordinary overnight — you only need to keep believing.

The woman pours water into the pool and onto the land. She nourishes herself and the world. Your gentleness right now does not only help you — it touches the people around you.

Keep going. You are walking in the right direction.`,
  },
];

// 站票 punch 说明
module.exports.PUNCH_RULES = {
  perBadge: 6,
  note: '每次官方点名签到后，获得一个站票 punch。集满 6 个 punch 换取一枚勋章。',
};
