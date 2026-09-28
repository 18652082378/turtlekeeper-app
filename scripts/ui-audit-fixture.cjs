'use strict';

// Deliberately synthetic, browser-only data. Never submit this fixture to a service.
module.exports = function fixture() {
  const date = '2026-09-28', createdAt = `${date}T02:00:00Z`;
  const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#e0eee7"/><ellipse cx="235" cy="185" rx="95" ry="75" fill="#679174"/><circle cx="342" cy="185" r="30" fill="#91b68c"/><path d="M180 135l55-28 58 28-5 91-53 33-57-32z" fill="none" stroke="#e3e9b7" stroke-width="9"/></svg>');
  const turtle = { id: 'ui-turtle', code: '青禾', speciesCode: 'GHG', speciesName: '果核蛋龟', gender: '母', status: '正常饲养', health: '健康', poolId: 'ui-pool', weight: 168, carapaceLength: 8.5, price: 350, acquiredDate: '2026-08-01', photo: image, createdAt,
    history: [{ id: 'ui-growth', date, weight: 168, carapaceLength: 8.5, photo: image, note: '专项检查虚构记录' }] };
  const friend = { id: 'ui-friend', name: '测试龟友', accountName: '测试龟友', avatar: image, latestContent: '今天状态很好', latestAt: createdAt, unreadCount: 1 };
  const listing = { id: 'ui-listing', title: '果核蛋龟 · 状态记录示例', speciesCode: 'GHG', speciesName: '果核蛋龟', photo: image, media: [{ type: 'image', url: image }], price: 588, stage: 'adult', gender: '母', status: 'active', city: '杭州', delivery: '当面自提', weight: 168, shellLength: 8.5, description: '此内容仅用于本地界面检查，没有实际出售商品。', sellerId: friend.id, sellerName: friend.name, sellerAvatar: image, createdAt, wantCount: 3 };
  const post = { id: 'ui-post', authorId: friend.id, authorName: friend.name, authorAvatar: image, title: '记录今天的小成长', content: '清晨换水后，记录一下青禾的状态。此条为本地测试数据。', photos: [image], media: [{ type: 'image', url: image }], circleId: 'general', topic: 'daily', createdAt, likeCount: 3, comments: [{ id: 'ui-comment', authorId: 'ui-second', authorName: '另一位测试龟友', content: '状态很好，继续记录！', createdAt }] };
  const feedback = { id: 'ui-feedback', type: '功能建议', authorId: friend.id, authorName: friend.name, content: '希望养护记录更加清晰，方便每天查看。', createdAt, comments: [] };
  return {
    loggedInPhone: '13000000000', accountName: '界面测试账号', cloudToken: '', policyConsentRequired: false,
    turtles: [turtle, ...Array.from({ length: 3 }, (_, i) => ({ ...turtle, id: `ui-batch-${i}`, code: `九月苗 ${i + 1}`, batchId: 'ui-batch', batchName: '九月孵化批次', gender: '未知', weight: 8, history: [] }))],
    keptSpecies: ['GHG'], turtlePools: [{ id: 'ui-pool', name: '青禾种龟池', type: 'breeder', count: 4, length: 120, width: 60, height: 40, note: '本地界面测试龟池', createdAt }],
    careRecords: [{ id: 'ui-care', title: '喂食', itemId: 'feeding', date, createdAt, note: '少量龟粮，食欲正常', poolId: 'ui-pool', poolName: '青禾种龟池', turtleRefs: [{ id: turtle.id, code: turtle.code, speciesName: turtle.speciesName }] }],
    carePlans: [{ id: 'ui-plan', name: '种龟晚餐', itemId: 'feeding', title: '喂食', turtleRefs: [{ id: turtle.id, code: turtle.code, speciesName: turtle.speciesName }], note: '少量龟粮' }],
    memos: [{ id: 'ui-memo', title: '换水', content: '换三分之一', remindTime: '18:00', repeat: true, reminderEnabled: true }],
    breedingRecords: [{ id: 'ui-nest', motherId: turtle.id, motherName: turtle.code, motherMode: 'archive', speciesCode: 'GHG', speciesName: turtle.speciesName, date, eggCount: 6, fertileCount: 5, hatchCount: 2, hatchedCount: 2, poolId: 'ui-pool', photo: image, note: '本地检查孵化记录', createdAt }],
    ledgerRecords: [{ id: 'ui-ledger', type: 'purchase', title: '青禾购入', turtleId: turtle.id, amount: 350, recordDate: date, createdAt, turtleSnapshot: turtle }, { id: 'ui-expense', type: 'other', category: '龟粮', title: '日常龟粮', amount: 38.5, recordDate: date, createdAt }],
    activityLogs: [{ id: 'ui-log', title: '记录了一次喂食', type: 'care', createdAt }],
    communityFriends: [friend], communityFriendsInitialized: true, communityFollowingUsers: [friend], selectedCommunityFriendId: friend.id, selectedCommunityFriend: friend,
    communityChatMessages: [{ id: 'ui-message', senderId: friend.id, content: '你好，想了解一下这只龟的情况。', createdAt }, { id: 'ui-reply', content: '你好，可以先看最近的成长记录。', mine: true, createdAt }],
    selectedFollowingUserId: friend.id, selectedCommunityUserId: friend.id, selectedCommunityUser: friend,
    communityPosts: [post], communityFollowingPosts: [post], communityUserPosts: [post], communityFeedInitialized: true, communityFeedHasMore: false, selectedCommunityPostId: post.id,
    communityActivityItems: [{ id: 'ui-notification', type: 'like', actorName: friend.name, postId: post.id, postTitle: post.title, createdAt }],
    marketListings: [listing], myMarketListings: [{ ...listing, isOwn: true }], communityFollowingListings: [listing], communityUserListings: [listing], marketFeedInitialized: true, marketFeedHasMore: false, marketFavoriteIds: [listing.id], marketHistoryIds: [listing.id], selectedMarketListingId: listing.id, selectedMarketSellerId: friend.id, selectedMarketSeller: { ...friend, sellerName: friend.name, sellerAvatar: image },
    publicFeedbackItems: [feedback], selectedFeedbackId: feedback.id,
    publicReviews: [{ id: 'ui-review', authorName: friend.name, rating: 5, content: '记录清晰，使用方便。', createdAt }],
    contentReports: [{ id: 'ui-report', targetType: 'community', targetTitle: '本地测试内容', targetExists: true, reasonLabel: '其他问题', status: 'pending', reporterName: '测试用户', createdAt }],
    adminSystemAnnouncements: [{ id: 'ui-announcement', title: '本地界面检查', content: '这条公告不会发送到服务器。', status: 'active', createdAt }],
    selectedTurtleId: turtle.id, selectedLedgerId: 'ui-ledger', selectedBreedingId: 'ui-nest', selectedSpeciesCode: 'GHG',
    __image: image
  };
};
