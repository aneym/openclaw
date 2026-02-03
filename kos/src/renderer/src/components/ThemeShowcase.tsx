import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  Bold,
  Italic,
  AlertCircle,
  Terminal,
  Settings,
  User,
  Bell,
  Plus,
  Trash2,
  Edit,
  Star,
  Heart,
  Mail,
} from 'lucide-react'

export function ThemeShowcase() {
  const [progress] = useState(42)
  const [sliderVal, setSliderVal] = useState([50])

  return (
    <ScrollArea className="h-full">
      <div className="max-w-5xl mx-auto p-8 space-y-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Theme Preview</h1>
          <p className="text-muted-foreground mt-2">
            All shadcn/ui components rendered with the active theme.
          </p>
        </div>

        <Separator />

        {/* Color Palette */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Colors</h2>
          <div className="grid grid-cols-4 gap-3">
            {[
              ['Background', 'bg-background', 'text-foreground'],
              ['Foreground', 'bg-foreground', 'text-background'],
              ['Primary', 'bg-primary', 'text-primary-foreground'],
              ['Secondary', 'bg-secondary', 'text-secondary-foreground'],
              ['Muted', 'bg-muted', 'text-muted-foreground'],
              ['Accent', 'bg-accent', 'text-accent-foreground'],
              ['Destructive', 'bg-destructive', 'text-destructive-foreground'],
              ['Card', 'bg-card', 'text-card-foreground'],
            ].map(([name, bg, text]) => (
              <div key={name} className={`${bg} ${text} rounded-lg p-4 text-sm font-medium border`}>
                {name}
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* Buttons */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Buttons</h2>
          <div className="flex flex-wrap gap-3">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon"><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled>Disabled</Button>
            <Button><Mail className="mr-2 h-4 w-4" /> With Icon</Button>
          </div>
        </section>

        <Separator />

        {/* Badges */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Badges</h2>
          <div className="flex flex-wrap gap-3">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </section>

        <Separator />

        {/* Cards */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Cards</h2>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Alpha</CardTitle>
                <CardDescription>A sample card with description</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Card body content.</p>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" size="sm">Cancel</Button>
                <Button size="sm">Deploy</Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Avatar><AvatarFallback>AN</AvatarFallback></Avatar>
                  <div>
                    <CardTitle className="text-base">Alex Neyman</CardTitle>
                    <CardDescription>alex@kineticapps.io</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Status</span>
                  <Badge>Active</Badge>
                </div>
                <Progress value={progress} className="mt-2" />
                <p className="text-xs text-muted-foreground text-right">{progress}% complete</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Form Elements */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Form Elements</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="Enter your name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" placeholder="Tell us about yourself..." />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Project</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payme">PayMe</SelectItem>
                    <SelectItem value="relay">Relay</SelectItem>
                    <SelectItem value="kos">kOS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id="terms" />
                <Label htmlFor="terms">Accept terms</Label>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="notifications">Notifications</Label>
                <Switch id="notifications" />
              </div>
              <div className="space-y-2">
                <Label>Volume ({sliderVal[0]}%)</Label>
                <Slider value={sliderVal} onValueChange={setSliderVal} max={100} step={1} />
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Toggle */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Toggle</h2>
          <div className="flex gap-2">
            <Toggle aria-label="Bold"><Bold className="h-4 w-4" /></Toggle>
            <Toggle aria-label="Italic"><Italic className="h-4 w-4" /></Toggle>
            <Toggle variant="outline" aria-label="Star"><Star className="h-4 w-4" /></Toggle>
            <Toggle variant="outline" aria-label="Heart"><Heart className="h-4 w-4" /></Toggle>
          </div>
        </section>

        <Separator />

        {/* Tabs */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Tabs</h2>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <Card>
                <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground">Overview tab content.</p></CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="analytics" className="mt-4">
              <Card>
                <CardHeader><CardTitle>Analytics</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground">Charts and metrics.</p></CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="settings" className="mt-4">
              <Card>
                <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground">Configuration options.</p></CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        <Separator />

        {/* Alerts */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Alerts</h2>
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>Heads up!</AlertTitle>
            <AlertDescription>You can add components using the CLI.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Your session has expired.</AlertDescription>
          </Alert>
        </section>

        <Separator />

        {/* Tooltips */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Tooltips</h2>
          <TooltipProvider>
            <div className="flex gap-4">
              <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon"><Settings className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Settings</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon"><User className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Profile</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon"><Bell className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Notifications</TooltipContent></Tooltip>
            </div>
          </TooltipProvider>
        </section>

        <Separator />

        {/* Table */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Table</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { task: 'KOS-1 Data Model', status: 'In Progress', priority: 'Urgent' },
                  { task: 'KOS-7 UI Layout', status: 'In Progress', priority: 'High' },
                  { task: 'KOS-2 Linear Integration', status: 'Backlog', priority: 'High' },
                  { task: 'KOS-10 Mobile App', status: 'Backlog', priority: 'Low' },
                ].map((row) => (
                  <TableRow key={row.task}>
                    <TableCell className="font-medium">{row.task}</TableCell>
                    <TableCell><Badge variant={row.status === 'In Progress' ? 'default' : 'secondary'}>{row.status}</Badge></TableCell>
                    <TableCell><Badge variant={row.priority === 'Urgent' ? 'destructive' : 'outline'}>{row.priority}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon"><Edit className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>

        <Separator />

        {/* Accordion */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Accordion</h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>What is kOS?</AccordionTrigger>
              <AccordionContent>An AI-native workspace built on OpenClaw.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>How does theming work?</AccordionTrigger>
              <AccordionContent>Themes override CSS custom properties at runtime via the theme applier.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        <Separator />

        {/* Skeleton */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Skeleton</h2>
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </div>
          </div>
        </section>

        <Separator />

        {/* Typography */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Typography</h2>
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight">Heading 1</h1>
            <h2 className="text-3xl font-semibold">Heading 2</h2>
            <h3 className="text-2xl font-semibold">Heading 3</h3>
            <p className="text-base">Body text — The quick brown fox jumps over the lazy dog.</p>
            <p className="text-sm text-muted-foreground">Muted text — Secondary information.</p>
            <code className="bg-muted px-2 py-1 rounded text-sm font-mono">inline code</code>
          </div>
        </section>

        <div className="h-12" />
      </div>
    </ScrollArea>
  )
}
