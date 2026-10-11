package io.github.duwenji.sanpoguide

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// チュートリアル 3-1 のハンズオン用。終わったら消す。
class CoroutinePracticeTest {
    private val log = mutableListOf<String>()

    private suspend fun fetchWeather(): String {
        delay(300)                     // 通信の代わり。待っている間、スレッドは空く
        return "晴れ"
    }

    private suspend fun fetchSpots(): List<String> {
        delay(300)
        return listOf("鶴岡八幡宮", "長谷寺")
    }

    @Test
    fun `suspend functions run in order, one after another`() = runBlocking {
        val start = System.currentTimeMillis()
        val weather = fetchWeather()
        val spots = fetchSpots()
        val took = System.currentTimeMillis() - start
        assertEquals("晴れ", weather)
        assertEquals(2, spots.size)
        assertTrue("順番に待つので 600ms 近くかかる: $took", took >= 590)
    }

    @Test
    fun `async runs them at the same time`() = runBlocking {
        val start = System.currentTimeMillis()
        val weather = async { fetchWeather() }
        val spots = async { fetchSpots() }
        assertEquals("晴れ", weather.await())
        assertEquals(2, spots.await().size)
        val took = System.currentTimeMillis() - start
        assertTrue("同時に待つので 300ms 台で済む: $took", took < 550)
    }

    @Test
    fun `a ticker loop stops when its job is cancelled`() = runBlocking {
        var ticks = 0
        val ticker = launch {
            while (isActive) {
                delay(100)
                ticks++
            }
        }
        delay(350)
        ticker.cancel()
        val atCancel = ticks
        delay(300)
        assertEquals("キャンセルの後は増えない", atCancel, ticks)
        assertTrue(atCancel in 2..4)
    }

    @Test
    fun `withContext moves the work to another thread and comes back`() = runBlocking {
        val caller = Thread.currentThread().name
        val worker = withContext(Dispatchers.IO) { Thread.currentThread().name }
        assertNotEquals(caller, worker)
        assertEquals(caller, Thread.currentThread().name)
    }

    @Test
    fun `tryLock drops a line that arrives while another is being spoken`() = runBlocking {
        val talking = Mutex()
        suspend fun talk(line: String) {
            if (!talking.tryLock()) { log += "見送り: $line"; return }
            try {
                log += "話す: $line"
                delay(200)             // 話している間
            } finally {
                talking.unlock()
            }
        }
        launch { talk("スポットの案内") }
        delay(50)
        launch { talk("雑談") }       // 話している最中に来た
        delay(400)
        launch { talk("天気の一言") } // 話し終わってから来た
        delay(300)
        assertEquals(listOf("話す: スポットの案内", "見送り: 雑談", "話す: 天気の一言"), log)
    }
}
