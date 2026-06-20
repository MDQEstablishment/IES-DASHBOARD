// Explicit lucide imports (keeps the bundle from pulling the whole icon set).
import {
  ClipboardList, LayoutDashboard, Layers, Building2, ListChecks, CheckSquare,
  Flag, FileText, Boxes, Settings, Home, Search, Bell, ChevronRight, ChevronDown,
  ChevronLeft, Check, X, Plus, Upload, Camera, AlertTriangle, Clock, TrendingUp,
  Filter, ArrowUpRight, Circle, LogOut, User, Package, Activity, MapPin, Download,
  Users, Wrench, FileCheck2, Inbox, RefreshCw, ChevronsUpDown, Image,
} from 'lucide-react'

const MAP = {
  ClipboardList, LayoutDashboard, Layers, Building2, ListChecks, CheckSquare,
  Flag, FileText, Boxes, Settings, Home, Search, Bell, ChevronRight, ChevronDown,
  ChevronLeft, Check, X, Plus, Upload, Camera, AlertTriangle, Clock, TrendingUp,
  Filter, ArrowUpRight, Circle, LogOut, User, Package, Activity, MapPin, Download,
  Users, Wrench, FileCheck2, Inbox, RefreshCw, ChevronsUpDown, Image,
}

export default function Icon({ name, size = 15, strokeWidth = 1.6, ...rest }) {
  const C = MAP[name] || Circle
  return <C size={size} strokeWidth={strokeWidth} {...rest} />
}
