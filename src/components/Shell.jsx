import { Outlet } from 'react-router-dom'
import PreviewBanner from './PreviewBanner'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Shell() {
  return (
    <div className="col" style={{ minHeight: '100vh' }}>
      <PreviewBanner />
      <div className="app grow">
        <Sidebar />
        <div className="content-wrap">
          <TopBar />
          <main className="content">
            <div className="content-narrow"><Outlet /></div>
          </main>
        </div>
      </div>
    </div>
  )
}
