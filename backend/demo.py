import re

from .contracts import GenerationRequest, GenerationResult


def demo_generate(request: GenerationRequest) -> GenerationResult:
    if request.operation == "create":
        return GenerationResult(title="未寄出的明天", mode="demo", text=f"""第三封来自未来的信，是在一个没有风的早晨送到的。

许眠把信放在桌上。她想看的故事是：“{request.intent}”。可眼前这封没有邮票的信，比那个念头更先打开了一扇门。

信纸上写着她的名字，落款日期却是七年之后。窗外，停了很久的钟楼重新响起来。

她推开门，门口站着一个浑身湿透的年轻人。年轻人看见她的第一句话是：“这一次，请不要坐最后一班船。”

许眠低头看向信的背面。那里画着一座灯塔，灯塔旁边，是一个与她此刻一模一样的人。

她把信折好，第一次没有走平常那条路。""")
    if request.operation == "continue":
        wish = request.intent.strip()
        memory = "刚才发生的一切仍留在他们心里，像一封尚未读完的信。" if request.context.before.strip() else ""
        direction = f"“{wish}，”有人把这个念头轻轻说了出来。门后的脚步声停了一瞬，故事也跟着换了方向。" if wish else "灯塔的门并没有锁。林舟推开它，看见台阶上摆着一盏已经熄灭的煤油灯。"
        return GenerationResult(title=request.title, mode="demo", text=f"""雨声渐渐变轻。{memory}

{direction}

墙上贴着一张旧地图。渡口、钟楼和灯塔被一条细细的红线连在一起，红线尽头，是一个谁也没有听说过的站名。

他们终于明白，昨夜留下来的并不是答案，而是一条可以继续走的路。

远处传来船笛。这一次，他们没有急着做决定，只是把地图收好，向天亮的地方走去。""")
    wish = request.intent.strip()
    rescue = bool(re.search("活|死|救|赶到|挽回", wish))
    original_demo = "苏晚" in request.context.before + request.context.selected + request.context.after
    person, actor = ("苏晚", "林舟") if original_demo else ("她", "他")
    shifts = {
        "minimal": "推车的车轮被一块石头卡住，留下了一道刚好够人穿过的缝隙。改变只发生在这一秒。",
        "reasonable": "船长发现了异常，提前靠回了渡口。这次停航会改变很多人的行程，可此刻，岸上的人终于有了足够的时间。",
        "new-world": "钟楼的指针忽然倒转了一格。岸边出现了另一座灯塔，像是这个世界第一次承认，还有一条尚未走过的路。",
    }
    action = f"{actor}没有再停在原地。他穿过那道缝隙，赶在木板断开之前拉住了{person}的手。救生绳随即从船上抛来，在雨里划出一道明亮的弧线。" if rescue else f"“{wish}。”这个愿望终于被说出口。原本已经决定离开的人收回了脚步，重新看向身边的同伴。"
    return GenerationResult(title="她回到了岸上" if rescue else "另一种可能", mode="demo", text=f"""{shifts[request.mode]}

{action}

{person}跌坐在岸边，铁盒从怀里滑落，发出一声轻响。她抬起头，过了很久才说：“我还以为，来不及了。”

“还来得及。”{actor}把外套披在她肩上，声音因为寒冷而发抖。

他们一起打开了铁盒。那些信仍指向同一座灯塔，等待他们去寻找答案；只是这一次，走向那里的人不再孤身一人。

雨还在下。他们沿着原来的街道向前走，身后，渡口的灯一盏一盏亮了起来。""")
