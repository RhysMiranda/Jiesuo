"""Hand-written HSK 1-4 grammar patterns, written for this project.

Each row: P(level, key, pattern, explanation, required words, detector).

Levels are the author's judgement of when a learner typically meets a pattern.
They are not copied from an official syllabus or a grammar site.

The detector is a small sequence language matched against tokens tagged by jieba:
    虽然 .. 但是|可是    literal words in order; `..` is a gap of any tokens
    /v                   any token whose POS tag starts with v
    很 /a                literal then a tagged token, adjacent
    ^  $                 start of sentence, end of sentence (ignoring punctuation)
    re:...               raw regex over the "word/pos word/pos" string
A detector finds candidate examples. It is a heuristic, not a parser.
"""
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Pattern:
    level: int
    key: str
    pattern: str
    explanation: str
    requires: tuple
    detect: str


def P(level, key, pattern, explanation, requires, detect):
    return Pattern(level, key, pattern, explanation, tuple(requires.split()), detect)


PATTERNS = [
    # ---- HSK 1: building a basic sentence
    P(1, "shi-link", "A 是 B", "是 joins two nouns: A is B. It does not go before adjectives.", "是", "/n|r 是 /n|r|m"),
    P(1, "bu-negation", "不 + verb/adjective", "不 negates habits, wishes, facts and descriptions.", "不", "不 /v|a"),
    P(1, "mei-negation", "没(有) + verb", "没 says something did not happen or has not happened.", "没 没有", "没|没有 /v"),
    P(1, "you-have", "A 有 B", "有 means A has or owns B.", "有", "/n|r 有 /n|m"),
    P(1, "meiyou-have", "A 没有 B", "The negative of 有 is always 没有, never 不有.", "没有", "没有 /n|m|r"),
    P(1, "you-exist", "place + 有 + thing", "Put the place first, then 有, to say something exists there.", "有 里", "里|上|下|前面|后面|这儿|那儿 有"),
    P(1, "hen-adjective", "subject + 很 + adjective", "Adjectives act as predicates with no 是. 很 is the usual link and is often not a strong 'very'.", "很", "很 /a"),
    P(1, "ma-question", "statement + 吗?", "Add 吗 to a statement to make it a yes/no question. The word order stays the same.", "吗", "吗 $"),
    P(1, "ne-followup", "noun + 呢?", "Asks 'and what about this one?' after something has been said.", "呢", r"re:^(?:\S+/(?:n|r|c)\w* ){1,2}呢/\w+ (?:\S+/x )*$"),
    P(1, "a-not-a", "verb + 不 + verb?", "Saying the positive then the negative makes a yes/no question.", "不", r"re:(?:^| )(?:(\S+)/\w+ 不/\w+ \1/|(\S)不\2/)"),
    P(1, "shenme", "什么", "'What' stays where the answer would go; it does not move to the front.", "什么", "什么"),
    P(1, "shei", "谁", "'Who' stays in the position of the person being asked about.", "谁", "谁"),
    P(1, "nar", "哪儿 / 哪里", "'Where', usually after 在 or a verb of going.", "哪儿 哪里", "哪儿|哪里"),
    P(1, "na-which", "哪 + measure + noun", "'Which one' needs a measure word after 哪.", "哪", "哪 /q|m"),
    P(1, "zenme-how", "怎么 + verb", "Asks how to do something.", "怎么", "怎么 /v"),
    P(1, "ji-count", "几 + measure + noun", "Asks 'how many' when the expected number is small.", "几", r"re:(?:^| )几(?!乎)\S*/\w+ "),
    P(1, "duoshao", "多少", "Asks 'how many' or 'how much' with no size expectation; the measure word is optional.", "多少", "多少"),
    P(1, "de-possessive", "A 的 B", "的 links an owner or describer to a noun: A's B.", "的", "/n|r 的 /n"),
    P(1, "number-measure", "number + measure + noun", "A number cannot sit directly before a noun; a measure word goes between them.", "个", r"re:(?:^| )[一二三四五六七八九十百两几\d]+(?:个|本|只|张|条|件|杯|位|辆|家|岁|块|瓶|支|双|篇|封|首|部|台|名|种)/\w+ |[一二三四五六七八九十百两几\d]+/m (?:个|本|只|张|条|件|杯|位|辆|家|岁|块|瓶|支|双|篇|封|首|部|台|名|种)\S*/\w+ "),
    P(1, "liang-two", "两 + measure", "Use 两, not 二, for two of something.", "两", r"re:(?:^| )两\S*/\w+ "),
    P(1, "demonstrative", "这/那 + measure + noun", "'This' and 'that' also take a measure word before the noun.", "这 那 个", "这个|那个|这些|那些"),
    P(1, "zai-location", "subject + 在 + place", "在 as a verb says where something is.", "在", "在 /n|s|r|f $"),
    P(1, "zai-place-verb", "在 + place + verb", "The place where an action happens goes before the verb.", "在", "在 /n|s|r .. /v"),
    P(1, "le-completed", "verb + 了", "了 after a verb marks the action as completed.", "了", "/v 了 /m|n|r"),
    P(1, "le-change", "sentence + 了", "了 at the end says the situation is new or has changed.", "了", "了 $"),
    P(1, "hui-can", "会 + verb", "会 means a skill you have learned, and also 'will probably'.", "会", "会 /v"),
    P(1, "neng-can", "能 + verb", "能 means able to, or allowed to, in the circumstances.", "能", "能 /v"),
    P(1, "xiang-want", "想 + verb", "想 before a verb is 'would like to'.", "想", "想 /v"),
    P(1, "yao-want", "要 + verb", "要 before a verb shows a firm intention or a need.", "要", "要 /v"),
    P(1, "ye-also", "也 + verb", "'Also' goes before the verb, never at the start of the sentence.", "也", "也 /v|a|d"),
    P(1, "dou-all", "plural + 都 + verb", "都 goes before the verb and refers back to everything named before it.", "都", "都 /v|a|d"),
    P(1, "he-and", "A 和 B", "和 joins nouns. It does not join verbs or whole clauses.", "和", "/n|r 和 /n|r"),
    P(1, "time-first", "time + subject + verb", "Time words come near the front, before the verb.", "今天", r"re:^(?:今天|明天|昨天|现在|去年|明年|今年|早上|晚上|上午|下午|中午|周末|星期\S)/\w+ (?:\S+ )*?\S+/v"),
    P(1, "tai-le", "太 + adjective + 了", "'Too' or 'so': often an exclamation rather than a complaint.", "太 了", "太 /a|d 了"),
    P(1, "qing-please", "请 + verb", "A polite request or invitation.", "请", "^ 请 /v|r"),
    P(1, "bie-dont", "别 + verb", "A direct 'don't'.", "别", "别 /v"),
    P(1, "buyao-dont", "不要 + verb", "'Don't', a little firmer or more formal than 别.", "不要", "不要 /v"),
    P(1, "ba-suggest", "sentence + 吧", "吧 softens a sentence into a suggestion or a guess.", "吧", "吧 $"),
    P(1, "lai-qu-place", "来/去 + place", "Destinations follow 来 and 去 directly, with no word for 'to'.", "来 去", "来|去 /n|s"),
    P(1, "date", "month + 月 + day + 日/号", "Dates run from the largest unit to the smallest.", "月 号", r"re:[一二三四五六七八九十\d]+月/\w+ (?:\S+ )?\S*[日号]/\w+ "),
    P(1, "clock-time", "number + 点", "Tells the hour.", "点", r"re:(?:^| )(?!一点(?:/\w+ )?(?:都|也|不|儿|没))[一二三四五六七八九十两\d]+点(?:钟|半)?/\w+ |/m 点钟?/\w+ "),
    P(1, "duo-da-age", "多大", "Asks someone's age, or how big something is.", "多 大", r"re:(?:^| )(?:多大/\w+|多/\w+ 大/\w+) (?:岁数/\w+ |年纪/\w+ |了/\w+ |呢/\w+ |吗/\w+ |啊/\w+ |\S+/x )"),
    P(1, "yixia-briefly", "verb + 一下", "Softens an action: do it briefly, just a moment.", "一下", "/v 一下"),
    P(1, "reduplicate-verb", "verb + verb", "Doubling a verb makes it brief and casual.", "看", r"re:(?:^| )(?:(\S)/v \1/v|(?!谢)(\S)\2/v) "),
    P(1, "gen-yiqi", "和/跟 + person + 一起 + verb", "Doing something together with someone.", "一起 跟", "和|跟 .. 一起"),
    P(1, "hai-still", "还 + verb", "还 means 'still' or 'also' before a verb.", "还", "还 /v|a"),
    # ---- HSK 2: time, comparison, simple linked clauses
    P(2, "guo-experience", "verb + 过", "过 says you have had this experience at some point.", "过", r"re:\S+/v\w* 过/\w+ |(?:^| )(?!不过|经过|通过|难过|超过|路过|度过|错过|放过|太过)\S+过/v\w* "),
    P(2, "zhe-state", "verb + 着", "着 says a state or action continues.", "着", "/v 着"),
    P(2, "zhengzai", "正在 + verb", "Stresses that the action is under way right now.", "正在", "正在 /v"),
    P(2, "zai-progressive", "在 + verb", "在 before a verb means someone is doing it now.", "在", r"re:(?:^| )在/\w+ (?!没有|离)\S+/v"),
    P(2, "bi-compare", "A 比 B + adjective", "A is more so than B. Do not add 很 before the adjective.", "比", "比 /n|r .. /a"),
    P(2, "meiyou-compare", "A 没有 B + adjective", "A is not as much so as B.", "没有", r"re:(?:^| )没有/\w+ (?!任何|什么|甚么|人)\S+/(?:n|r)\w* (?:那么/\w+ |这么/\w+ )?\S+/a"),
    P(2, "gen-yiyang", "A 跟/和 B 一样", "A and B are the same, optionally followed by the adjective they share.", "一样 跟", "跟|和 .. 一样"),
    P(2, "yinwei-suoyi", "因为…所以…", "Chinese often states both the cause and the result.", "因为 所以", "因为 .. 所以"),
    P(2, "suiran-danshi", "虽然…但是…", "Although... still. Unlike English, both halves carry a link word.", "虽然 但是", "虽然 .. 但是|可是"),
    P(2, "ruguo-jiu", "如果…就…", "If... then. 就 sits before the verb in the second clause.", "如果 就", "如果 .. 就"),
    P(2, "kuai-le", "快…了", "Something is about to happen.", "快 了", r"re:(?:^| )快/\w+ (?:\S+ ){1,8}?了/\w+ (?:\S+/x )*$"),
    P(2, "yao-le", "快要/就要…了", "Something is about to happen; 就要 can follow a stated time.", "快要 就要 了", "快要|就要 .. 了"),
    P(2, "yibian", "一边…一边…", "Two actions at the same time, by one person.", "一边", "一边 .. 一边"),
    P(2, "you-you", "又…又…", "Has both qualities at once.", "又", "又 /a|v .. 又"),
    P(2, "yuelaiyue", "越来越 + adjective", "More and more over time.", "越来越", "越来越"),
    P(2, "shi-de", "是…的", "Spotlights when, where or how a past event happened, or states a firm judgement.", "是 的", "是 .. /v 的 $"),
    P(2, "de-complement", "verb + 得 + description", "Describes how well or how an action is done.", "得", "/v 得 /a|d"),
    P(2, "result-complement", "verb + 完/到/见/懂/好", "A second word says what the action achieved.", "完 到 见 懂 好", "/v 完|到|见|懂|好"),
    P(2, "direction-complement", "verb + 来/去", "Shows direction relative to the speaker.", "来 去", r"re:(?:^| )(?:拿|带|走|跑|飞|开|送|搬|寄|追|买)/\w+ (?:来|去)/\w+ "),
    P(2, "gei-for", "给 + person + verb", "Marks who the action is done for or to.", "给", "给 /n|r /v"),
    P(2, "dui-toward", "对 + person/thing + …", "Marks who or what an attitude or action is directed at.", "对", "对 /n|r .. /v|a"),
    P(2, "li-distance", "A 离 B + 远/近", "Distance from one place or time to another.", "离 远 近", "离 .. 远|近"),
    P(2, "cong-dao", "从 A 到 B", "From A to B, in space or in time.", "从 到", "从 .. 到"),
    P(2, "xian-ranhou", "先…再/然后…", "First this, then that.", "先 再 然后", "先 .. 再|然后"),
    P(2, "jiu-early", "就 + verb", "就 ties a result to what came before: then, right away, or sooner and easier than expected.", "就", "就 /v"),
    P(2, "cai-late", "才 + verb", "才 means only then: later or harder than expected, or only on that condition.", "才", "才 /v"),
    P(2, "yijing-le", "已经…了", "Already. The 了 usually stays.", "已经 了", "已经 .. 了"),
    P(2, "haishi-or", "A 还是 B?", "'Or' in a question that offers a choice.", "还是", r"re:还是/\w+ (?:\S+ )*?\S*[？?]/x "),
    P(2, "huozhe-or", "A 或者 B", "'Or' in a statement.", "或者", "或者"),
    P(2, "danshi-but", "…,但是/可是…", "'But' at the start of the second clause.", "但是 可是", "但是|可是"),
    P(2, "weishenme", "为什么", "Asks why.", "为什么", "为什么"),
    P(2, "zenmeyang", "怎么样", "Asks how something is, or offers a suggestion: how about it?", "怎么样", "怎么样"),
    P(2, "duo-adj", "多 + adjective?", "How long, how far, how tall and so on.", "多", "多 高|长|远|重|久|少"),
    P(2, "duration", "verb + (了) + duration", "How long the action lasts goes after the verb.", "了 小时", "/v 了 /m .. 小时|分钟|天|年|星期|月"),
    P(2, "action-count", "verb + number + 次/遍", "How many times something is done goes after the verb.", "次 遍", r"re:\S+/v\w* (?:[一二两三四五六七八九十几\d]+[次遍]/\w+|\S+/m [次遍]/\w+) "),
    P(2, "de-relative", "verb phrase + 的 + noun", "Describers come before the noun, joined by 的: the book I bought.", "的", "/v 的 /n"),
    P(2, "de-noun-drop", "… 的 (noun left out)", "With no noun after it, 的 means 'the one that belongs to...': 这是我的 is 'this is mine'.", "的", r"re:是/\w+ \S+/(?:r|n)\w* 的/\w+ (?:\S+/x )*$"),
    P(2, "youdian", "有点儿 + adjective", "A little too, usually said of something unwelcome.", "有点儿 有点", "有点儿|有点 /a|v"),
    P(2, "adj-yidian", "adjective + 一点儿", "A bit more so, used for comparing or asking for a change.", "一点儿 一点", "/a 一点儿|一点"),
    P(2, "zui", "最 + adjective", "The most.", "最", "最 /a|v"),
    P(2, "yinggai", "应该 + verb", "Should or ought to.", "应该", "应该 /v"),
    P(2, "keyi", "可以 + verb", "May, or it is fine to.", "可以", "可以 /v"),
    P(2, "xihuan-verb", "喜欢 + verb", "Like doing something; no word for 'to' is needed.", "喜欢", "喜欢 /v"),
    P(2, "jiao-name", "叫 + name", "To be called.", "叫", "叫 /nr"),
    P(2, "rang-causative", "A 让 B + verb", "A lets or makes B do something.", "让", "让 /n|r /v"),
    P(2, "de-shihou", "… 的时候", "When or while; the clause comes first.", "的 时候", "的 时候"),
    P(2, "yiqian-yihou", "… 以前/以后", "Before or after: these follow the event, the reverse of English.", "以前 以后", "以前|以后"),
    # ---- HSK 3: object-fronting, passive, richer connectors
    P(3, "ba-disposal", "subject + 把 + object + verb + result", "Brings the object forward to say what was done to it. The verb needs a result or follow-up.", "把", "把 /n|r .. /v"),
    P(3, "bei-passive", "A 被 B + verb", "A has something done to it, often unwelcome.", "被", "被 .. /v"),
    P(3, "lian-dou", "连…都/也…", "Even: highlights the surprising case.", "连 都 也", "连 .. 都|也"),
    P(3, "budan-erqie", "不但…而且…", "Not only... but also.", "不但 而且", "不但 .. 而且|还|也"),
    P(3, "chule-yiwai", "除了…以外", "Except for, or in addition to, depending on whether 都 or 也 follows.", "除了 以外", "除了 .. 以外|都|也|还"),
    P(3, "zhiyao-jiu", "只要…就…", "As long as: the condition is enough.", "只要 就", "只要 .. 就"),
    P(3, "zhiyou-cai", "只有…才…", "Only if: nothing else will do.", "只有 才", "只有 .. 才"),
    P(3, "yi-jiu", "一…就…", "As soon as.", "一 就", r"re:(?:^| )一/\w+ (?!开始)\S+/v\w* (?:\S+ ){0,8}?就/\w+ "),
    P(3, "yue-yue", "越 A 越 B", "The more A, the more B.", "越", "越 .. 越"),
    P(3, "yaoshi", "要是…(就)…", "A spoken 'if'.", "要是", "要是"),
    P(3, "dui-laishuo", "对…来说", "As far as someone is concerned; for them.", "对 来说", "对 .. 来说"),
    P(3, "weile", "为了 + goal", "In order to; the goal usually comes first.", "为了", "为了"),
    P(3, "mei-dou", "每…都…", "Every one, without exception; 都 usually stays.", "每 都", "每 .. 都"),
    P(3, "wh-dou", "什么/谁/哪儿 + 都/也", "A question word plus 都 means everything, everyone or everywhere.", "什么 都 也", "什么|谁|哪儿|哪里 都|也"),
    P(3, "yidian-ye-bu", "一点儿也不…", "Not at all.", "一点儿 也 不", "一点儿|一点 也|都 不|没"),
    P(3, "kanqilai", "看起来 / 听起来…", "It looks, sounds or tastes as if; judging by the senses.", "看起来", "看起来|听起来|闻起来|吃起来"),
    P(3, "qilai-start", "verb + 起来", "The action starts and carries on.", "起来", r"re:(?:^| )(?!看|听|闻|吃|喝|摸|说|想)\S+/v\w* 起来/\w+ "),
    P(3, "xiaqu-continue", "verb + 下去", "Keep on doing it.", "下去", "/v 下去"),
    P(3, "potential", "verb + 得/不 + result", "Says whether a result is possible: can or can't manage it.", "得 不", "/v 得|不 了|完|到|懂|见|动|起"),
    P(3, "chulai-out", "verb + 出来", "Comes out, or becomes identifiable.", "出来", "/v 出来"),
    P(3, "compound-direction", "verb + 进来/回去/上来…", "Two direction words after a verb show path and viewpoint.", "进来 回去 上来 下去", r"re:(?:^| )(?!应该|会|能|要|想|可以|必须|得)\S+/v\w* (?:进来|进去|回来|回去|上来|上去|过来|过去)/\w+ "),
    P(3, "youshihou", "有时候…有时候…", "Sometimes this, sometimes that.", "有时候", "有时候|有时 .. 有时候|有时"),
    P(3, "bi-amount", "A 比 B + adjective + amount", "The exact or rough gap goes after the adjective.", "比 多 一点儿", "比 .. /a 多|一点儿|一点|得多"),
    P(3, "bi-geng", "A 比 B 更/还 + adjective", "Use 更 or 还 in a comparison, never 很.", "比 更 还", "比 .. 更|还 /a"),
    P(3, "xiang-yiyang", "像…一样", "Just like; a simile.", "像 一样", "像 .. 一样"),
    P(3, "bu-yiding", "不一定", "Not necessarily.", "不 一定", r"re:(?:^| )(?:不一定/\w+|不/\w+ 一定/\w+) "),
    P(3, "you-again", "又 + verb + 了", "Again, of something that already happened.", "又 了", "又 /v .. 了"),
    P(3, "zai-again", "再 + verb", "Again, of something yet to happen.", "再", "再 /v"),
    P(3, "yizhi", "一直 + verb", "All along; continuously.", "一直", "一直 /v|d"),
    P(3, "zong-always", "总是 + verb", "Always, often with a hint of annoyance.", "总是", "总是"),
    P(3, "shi-bu-shi", "是不是", "Checks a guess: isn't that so?", "是不是", "是不是"),
    P(3, "dasuan", "打算 + verb", "Plan to.", "打算", "打算 /v"),
    P(3, "bixu", "必须 + verb", "Must.", "必须", "必须 /v"),
    # ---- HSK 4: written connectors, stance, abstract relations
    P(4, "jishi-ye", "即使…也…", "Even if.", "即使 也", "即使 .. 也"),
    P(4, "wulun-dou", "无论…都/也…", "No matter what.", "无论 都 也", "无论 .. 都|也"),
    P(4, "buguan-dou", "不管…都/也…", "No matter what; more spoken than 无论.", "不管 都 也", "不管 .. 都|也"),
    P(4, "jiran-jiu", "既然…就…", "Since that is the case, then...", "既然", "既然"),
    P(4, "bujin-erqie", "不仅…而且/还…", "Not only... but also; more formal than 不但.", "不仅 而且 还", "不仅 .. 而且|还|也"),
    P(4, "jinguan", "尽管…但是/还是…", "Even though, stating a fact that is accepted.", "尽管", "尽管 .. 但|但是|可是|还是|仍然|也|却"),
    P(4, "ruguo-dehua", "如果…的话", "If; 的话 closes the condition and either word can be dropped.", "的话", r"re:如果/\w+ (?:\S+ )*?的话/|(?:^| )\S+/(?!r)\w+ 的话/\w+ \S+/x "),
    P(4, "bing-not", "并 + 不/没", "Stresses that a negative runs against what you might think.", "并 不 没", "并 不|没"),
    P(4, "nandao-ma", "难道…吗", "A rhetorical question: surely you don't mean...?", "难道", "难道"),
    P(4, "daodi", "到底", "Presses a question: what on earth? in the end?", "到底", "到底"),
    P(4, "bushi-ershi", "不是…而是…", "Not this, but that.", "不是 而是", "不是 .. 而是"),
    P(4, "bushi-jiushi", "不是…就是…", "If not this, then that: one of the two.", "不是 就是", r"re:(?:^| )不是/\w+ (?:\S+ ){0,8}?就是/\w+ "),
    P(4, "yu-youguan", "跟/与…有关", "Related to.", "有关", "跟|和|与 .. 有关"),
    P(4, "yi-wei", "以 A 为 B", "Take A as B; a written frame.", "以 为", "以 .. 为"),
    P(4, "you-zucheng", "由…组成", "Made up of.", "由 组成", "由 .. 组成"),
    P(4, "zuowei", "作为…", "As, in the role of.", "作为", "作为"),
    P(4, "tongguo", "通过…", "By means of, through.", "通过", "通过"),
    P(4, "genju", "根据…", "According to.", "根据", "根据"),
    P(4, "suizhe", "随着…", "Along with, as something changes.", "随着", "随着"),
    P(4, "duiyu", "对于…", "With regard to.", "对于", "对于"),
    P(4, "buru", "A 不如 B", "A is not as good as B.", "不如", "不如"),
    P(4, "shifou", "是否", "Whether; a written form of 是不是.", "是否", "是否"),
    P(4, "dang-shihou", "当…的时候", "At the moment when; adds a formal frame around 的时候.", "当 时候", "当 .. 时候"),
    P(4, "zai-xia", "在…下", "Under certain conditions or help.", "在 下", r"re:(?:^| )在/\w+ (?:\S+ ){1,6}?\S+/n\w* 下/\w+ (?:\S+/x |的/)"),
    P(4, "bude-bu", "不得不", "Have no choice but to.", "不得不", "不得不"),
    P(4, "de-adverb", "adjective + 地 + verb", "地 turns a description into an adverb before a verb.", "地", "/a 地 /v"),
]


def compile_detector(spec):
    """Turn a detector string into a regex over 'word/pos word/pos' text."""
    if spec.startswith("re:"):
        return re.compile(spec[3:])
    parts, anchored_end = [], False
    tokens = spec.split()
    anchored_start = tokens[0] == "^"
    if anchored_start:
        tokens = tokens[1:]
    if tokens[-1] == "$":
        anchored_end, tokens = True, tokens[:-1]
    for tok in tokens:
        if tok == "..":
            parts.append(r"(?:\S+ ){0,20}?")
        elif tok.startswith("/"):
            tags = "|".join(tok[1:].split("|"))
            parts.append(rf"\S+/(?:{tags})\w* ")
        else:
            words = "|".join(tok.split("|"))
            parts.append(rf"(?:{words})/\w+ ")
    prefix = "^" if anchored_start else "(?:^| )"
    # Sentences are matched with a trailing space; $ tolerates final punctuation.
    suffix = r"(?:[^\s/]+/x )*$" if anchored_end else ""
    return re.compile(prefix + "".join(parts) + suffix)
