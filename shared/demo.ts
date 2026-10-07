import type { GenerationRequest, GenerationResult } from './contracts';

export const DEMO_TITLE = '雨停之前';
export const DEMO_TEXT = `雨落在雾港的旧钟楼上，整座城市像一封还没有拆开的信。

林舟赶到渡口的时候，末班船已经拉响了汽笛。苏晚站在栈桥尽头，怀里抱着那只装满旧信的铁盒。她说，灯塔里藏着这场事故真正的答案。

“等我回来。”她笑了一下，雨水顺着她的睫毛落下来。

林舟忽然想起，苏晚每次说这句话，都会把袖口折好。他向前迈了一步，却被一辆运货的推车挡住了去路。

就在那一瞬间，栈桥下传来一声闷响。腐朽的木板从中间断开，苏晚和铁盒一起落入了黑色的水里。

林舟跳进水中，伸手只抓到一截松开的缎带。暗流拖着他撞向桥墩，岸边有人把救生圈抛了下来。

等他再次爬上码头，末班船的灯已经远去。搜救队找了整整一夜，仍然没有找到苏晚。

第二天清晨，林舟在渡口拾起一封被水浸透的信。纸上只有一行模糊的字：如果灯塔亮起来，请不要让它再熄灭。

钟楼敲了六下。他终于知道自己应该去哪里，可那个答应回来的人，再也没有回到岸上。`;

export function demoGenerate(request: GenerationRequest): GenerationResult {
  if (request.operation === 'create') {
    return { title: '未寄出的明天', mode: 'demo', text: `第三封来自未来的信，是在一个没有风的早晨送到的。

许眠把信放在桌上。她想看的故事是：“${request.intent}”。可眼前这封没有邮票的信，比那个念头更先打开了一扇门。

信纸上写着她的名字，落款日期却是七年之后。窗外，停了很久的钟楼重新响起来。

她推开门，门口站着一个浑身湿透的年轻人。年轻人看见她的第一句话是：“这一次，请不要坐最后一班船。”

许眠低头看向信的背面。那里画着一座灯塔，灯塔旁边，是一个与她此刻一模一样的人。

她把信折好，第一次没有走平常那条路。` };
  }
  if (request.operation === 'continue') {
    const wish = request.intent.trim();
    const tail = request.context.before.slice(-70).trim();
    return { title: request.title, mode: 'demo', text: `雨声渐渐变轻。${tail ? '刚才发生的一切仍留在他们心里，像一封尚未读完的信。' : ''}

${wish ? '“' + wish + '，”有人把这个念头轻轻说了出来。门后的脚步声停了一瞬，故事也跟着换了方向。' : '灯塔的门并没有锁。林舟推开它，看见台阶上摆着一盏已经熄灭的煤油灯。'}

墙上贴着一张旧地图。渡口、钟楼和灯塔被一条细细的红线连在一起，红线尽头，是一个谁也没有听说过的站名。

他们终于明白，昨夜留下来的并不是答案，而是一条可以继续走的路。

远处传来船笛。这一次，他们没有急着做决定，只是把地图收好，向天亮的地方走去。` };
  }
  const custom = request.intent.trim();
  const rescue = /活|死|救|赶到|挽回/.test(custom);
  const isDemoStory = /苏晚/.test(request.context.before + request.context.selected + request.context.after);
  const person = isDemoStory ? '苏晚' : '她';
  const actor = isDemoStory ? '林舟' : '他';
  const shift = request.mode === 'new-world'
    ? '钟楼的指针忽然倒转了一格。岸边出现了另一座灯塔，像是这个世界第一次承认，还有一条尚未走过的路。'
    : request.mode === 'reasonable'
      ? '船长发现了异常，提前靠回了渡口。这次停航会改变很多人的行程，可此刻，岸上的人终于有了足够的时间。'
      : '推车的车轮被一块石头卡住，留下了一道刚好够人穿过的缝隙。改变只发生在这一秒。';
  return { title: rescue ? '她回到了岸上' : '另一种可能', mode: 'demo', text: `${shift}

${rescue
  ? actor + '没有再停在原地。他穿过那道缝隙，赶在木板断开之前拉住了' + person + '的手。救生绳随即从船上抛来，在雨里划出一道明亮的弧线。'
  : '“' + custom + '。”这个愿望终于被说出口。原本已经决定离开的人收回了脚步，重新看向身边的同伴。'}

${person}跌坐在岸边，铁盒从怀里滑落，发出一声轻响。她抬起头，过了很久才说：“我还以为，来不及了。”

“还来得及。”${actor}把外套披在她肩上，声音因为寒冷而发抖。

他们一起打开了铁盒。那些信仍指向同一座灯塔，等待他们去寻找答案；只是这一次，走向那里的人不再孤身一人。

雨还在下。他们沿着原来的街道向前走，身后，渡口的灯一盏一盏亮了起来。` };
}
