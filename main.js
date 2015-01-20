var $                 = require('jquery-browserify');
var _                 = require('underscore');
var moment            = require('moment');
var Backbone          = require('backbone');
Backbone.$            = $;
Backbone.Marionette   = require('backbone.marionette');
Backbone.LocalStorage = require('backbone.localstorage');

var M = Backbone.Marionette;

var KEYS = {
    tab: 9,
    enter: 13,
};

var MODULES = {
    budget: 'budget',
    selection: 'selection'
};

/* Models */

var AppModel = Backbone.Model.extend({

    localStorage: new Backbone.LocalStorage("AppModel"),

    defaults: { 
        current_module: null,
        current_budget: null,
    },

});

var Budget = Backbone.Model.extend({

    defaults: { 
        name: null,
        allowance: null,
        cummulative_total: 0,
    },

    incrementTotal: function(amount) {
        this.set('cummulative_total', this.get('cummulative_total') + amount);
    },

    storeExpense: function(amount) {
        var expense = ExpensesList.create({
            amount: amount,
            date: (new Date).getTime(),
            budget: this.id
        }, {silent: true});
        expense.save();

        this.incrementTotal(-amount);
        this.save();

        ExpensesList.trigger('add', expense, ExpensesList);
        return expense;
    },

    removeExpense: function(expense) {

        if (_.isString(expense)) {
            expense = ExpensesList.get(expense);
        }

        var amount = expense.get('amount');
        this.incrementTotal(amount);
        
        this.destroyExpense(expense)
    },

    destroyExpense: function(expense) {

        // Hack around the fact that we keep this model in two collections at once:
        // The full list of expenses, and our filtered collection that we render per budget.
        // we use trigger because all the collections are listening to model change events,
        // but, since we lose the collection linkage there, first we have to sync/delete so the
        // item is remove from localstorage.
        // TODO: Figure out a better way than keeping two collections.
        
        expense.sync('delete', expense);
        expense.trigger('destroy', expense);
    },

    renew: function() {
        this.incrementTotal(this.get('allowance'));
    },

    resetBudget: function() {
        var filtered = ExpensesList.where({budget: this.get('id')})
        _.each(filtered, function(expense) {
           this.destroyExpense(expense);
        }, this)
        this.incrementTotal(this.get('allowance'));
    }

});

var Budgets = Backbone.Collection.extend({

    model: Budget,

    localStorage: new Backbone.LocalStorage("Budgets"),

    grandTotal: function() {
        return this.reduce(function(memo, budget) {
            return memo + budget.get('cummulative_total');
        }, 0);
    },

    renew: function() {
        this.each(function(budget) {
            budget.renew();
            budget.save();
        });
    },

    create: function(data, options) {
        data.cummulative_total = data.cummulative_total || data.allowance;
        return Backbone.Collection.prototype.create.call(this, data, options);
    },

});

var Expense = Backbone.Model.extend({

    defaults: { 
        amount : 0,
        date   : null, // Three letter DOW
        budget : null, // Association to a Budget model.
    },

    serializeData: function() {
        var json = this.toJSON();
        json.fmt_date = moment(this.get('date')).format('ddd');
        return json;
    }

});

var Expenses = Backbone.Collection.extend({

    localStorage: new Backbone.LocalStorage("Expenses"),

    model: Expense,

    destroyAll: function() {
        var model;

        while (model = this.first()) {
            model.destroy();
        }
    }

});

/* Behaviors */

window.Behaviors = {};

M.Behaviors.behaviorsLookup = function() {
    return window.Behaviors;
}

window.Behaviors.Modal = M.Behavior.extend({

    triggers: {
        'click [data-cancel]': 'cancel',
        'click [data-accept]': 'accept',
    },

    onSetDfd: function(dfd) {
        this.dfd = dfd;
    },

    onCancel: function() {
        appLayout.closeModal();
        this.dfd.reject();
    },

    onAccept: function() {
        var data = this.view.triggerMethod('get:data');
        if (data === null) {
            this.view.triggerMethod('show:validation');
        } else {
            appLayout.closeModal();
            this.dfd.resolve(data);
        }
    },

});

/* Views */

var CreateBudgetModal = M.ItemView.extend({

    behaviors: { Modal: {} },

    template: '#create-budget',
    
    ui: {
        name: '[data-budget-name]',
        allowance: '[data-budget-allowance]',
    },

    onGetData: function() {
        var name = this.getValidNameOrNull();
        var allowance = this.getValidAllowanceOrNull();

        if (_.isNull(name) && _.isNull(allowance)) {
            return null;
        } else {
            return {name: name, allowance: allowance};
        }

    },

    getValidNameOrNull: function() {
        var name = this.ui.name.val();
        return name || null;
    },

    getValidAllowanceOrNull: function() {
        var allowance = this.ui.allowance.val();
        allowance = parseInt(allowance, 10);
        return _.isNaN(allowance) ? null : allowance;
    },

    onShowValidation: function() {
        console.log('show validation');
        // TODO Display validation message.
    }

});


var AppLayout = M.LayoutView.extend({

    template: '#app-layout',

    initialize: function() {
        this.listenTo(App, 'change:current_module', this.render);
    },

    regions: {
        moduleRegion : '[data-module-region]',
        modalRegion  : '[data-modal-region]',
    },

    onRender: function() {
        var moduleView = this.getModuleView();
        this.getRegion('moduleRegion').show(moduleView);
    },

    getModuleView: function() {
        var currentModule = App.get('current_module');
        return currentModule === MODULES.budget ? this.getBudgetLayout() : this.getSelectionLayout();
    },

    getSelectionLayout: function() {
        return new SelectionLayout();
    },

    getBudgetLayout: function() {
        var currentBudget = App.get('current_budget'); 
        return new BudgetLayout({model: BudgetList.get(currentBudget)});
    },

    showModal: function(modalView) {
        var dfd = $.Deferred();
        modalView.triggerMethod('set:dfd', dfd);
        this.getRegion('modalRegion').show(modalView);
        this.$el.toggleClass('modal-active');
        return dfd;
    },

    closeModal: function() {
        this.$el.on('transitionend.modal-close', _.bind(function() {
            this.getRegion('modalRegion').empty();
            this.$el.off('transitionend.modal-close');
        }, this));
        this.$el.removeClass('modal-active');
    },

});

var SelectionLayout = M.LayoutView.extend({

    template: '#selection-layout',

    regions: {
        'budgetList' : '[data-budget-list-mount]',
        'actions'    : '[data-actions]',
        'grandTotal' : '[data-grand-total]',
        'empty'      : '[data-empty]',
    },

    events: {
        'click [data-new-budget]': 'createNewBudget',
    },

    onShow: function() {
        BudgetList.isEmpty() ?  this.showEmpty() : this.showBudgetList();
    },

    showEmpty: function() {
        this.getRegion('empty').show(new EmptySelectionView());
    },

    showBudgetList: function() {
        this.getRegion('budgetList').show(new BudgetListView({
            collection: BudgetList
        }));
        this.getRegion('grandTotal').show(new GrandTotalView({
            model: BudgetList
        }));
        this.getRegion('actions').show(new SelectionModuleActionsView());
    },

    createNewBudget: function() {
        appLayout.showModal(
            new CreateBudgetModal()
        ).done(this.saveBudget);
    },

    saveBudget: function(budgetData) {
        var budget = BudgetList.create(budgetData, {silent: true});
        budget.save();
        BudgetList.trigger('add', budget, BudgetList);
    }

});

var SelectionModuleActionsView = M.ItemView.extend({

    events: {
        'click [data-reset-all]': 'resetAllBudgets'
    },

    template: '#selection-module-actions',

    resetAllBudgets: function() {

        // TODO confirm -> Modal
        if (!confirm("Restart week for all budgets?")) {
            return;
        }

        ExpensesList.destroyAll();
        BudgetList.renew();

        // TODO you should be able to remove this.
        window.location.reload();
    }
});

var EmptySelectionView = M.ItemView.extend({
    template: '#empty-selection'
});

var BudgetItemView = M.ItemView.extend({

    tagName: 'li',

    template: '#budget-row',

    events: {
        'click [data-select-budget]': 'selectBudget'
    },

    selectBudget: function(e) {
        App.set({
            'current_module': MODULES.budget,
            'current_budget': $(e.currentTarget).attr('id'),
        });
        App.save();
    },

})

var BudgetListView = M.CollectionView.extend({
    childView: BudgetItemView
})

var BudgetLayout = M.LayoutView.extend({

    template: '#budget-layout',

    regions: {
        expenseList : '[data-expense-list]',
        balance     : '[data-balance]',
        actions     : '[data-budget-actions]',
    },

    events: {
        'click [data-show-selection]': 'showBudgetSelection'
    },

    onShow: function() {
        this.getRegion('expenseList').show(new ExpenseListView({
            collection: ExpensesList,
            model: this.model
        }));
        this.getRegion('balance').show(new BalanceView({
            model: this.model
        }));
        this.getRegion('actions').show(new BudgetActionsView({
            model: this.model
        }));
    },

    showBudgetSelection: function() {
        App.set({
            'current_budget': null,
            'current_module': MODULES.selection
        });
        App.save();
    },

});

var ExpenseRowView = M.ItemView.extend({

    template: '#expense-row',

    serializeData: function() {
        return this.model.serializeData();
    },

    onRender: function() {
        // Hack around the tag name issue without having 
        // to move markup into this class. :(
        this.$el = this.$el.children();
        this.$el.unwrap();
        this.setElement(this.$el);
    }
});

var NoExpensesView = M.ItemView.extend({
    template: '#no-expenses',
});

var ExpenseListView = M.CompositeView.extend({

    template: '#expenses-table',

    childView: ExpenseRowView,

    emptyView: NoExpensesView,

    childViewContainer: '[data-expense-list]',

    events: {
        keydown: 'handleSubmit',
        'click [data-expense-action]': 'removeExpense'
    },

    ui: {
        input: '[data-expense-form]'
    },

    initialize: function(opts) {
        this.completeCollection = opts.collection;
        this.collection = this.filterCollection(this.completeCollection);
        this.listenTo(this.model, 'change', this.render);
    },

    filterCollection: function(completeCollection) {
        return new Expenses(completeCollection.where({budget: this.model.get('id')}));
    },

    handleSubmit: function(e) {

        if (!this.validEvent(e)) {
            return;
        }

        var amount = Math.ceil(
            parseFloat(this.ui.input.val())
        );

        if (!_.isNumber(amount)) { 
            return;
        }

        if (this.maybeWipe(amount)) {
            return;
        }

        this.resetInput();

        // Store the new expense in the global list, but also update
        // the current views collection
        var expense = this.model.storeExpense(amount);
        this.collection.add(expense);

    },

    resetInput: function() {
        this.ui.input.val('');
    },

    validEvent: function(e) {
        return [KEYS.tab, KEYS.enter].indexOf(e.keyCode) !== -1;
    }, 

    removeExpense: function(e) {
        var answer = confirm("Do you want to delete this expense?");
        if (answer) {
            var expenseId = $(e.currentTarget).attr('id');
            this.model.removeExpense(expenseId);
        }
    },

    // TODO Delete this when the UI to perform restarts is complete
    maybeWipe: function(amount) {

        var wiped = false;

        if (amount === 2015) {
            wiped = true;
            this.model.destroy();
            App.set('current_budget', null);
            App.save();
            return;
        }

        if (amount === 666) {
            wiped = true;
            window.localStorage.clear();
            window.location.reload();
            return;
        }

        return wiped;

    },

    /* This is a bit of a hack. Because we don't have the proper 
     * hooks into the list view rendering, we need to precompute
     * the running_total before hand. But we don't want that attribute
     * to hang around and need to be maintained, so afterwords we unset it
     */

    onBeforeRenderCollection: function() {
        this.addRunningTotal();
    },

    onRenderCollection: function() {
        this.removeRunningTotal();
    },

    onBeforeAddChild: function() {
        this.addRunningTotal();
    },

    onAddChild: function() {
        this.removeRunningTotal();
    },

    addRunningTotal: function() {
        var startAmount = this.model.get('allowance');
        this.collection.each(function(expense) {
            expense.set('running_total', startAmount -= expense.get('amount'), {silent: true});
        })
    },

    removeRunningTotal: function() {
        this.collection.each(function(expense) {
            expense.unset('running_total', {silent: true});
        });
    }
});

var BalanceView = M.ItemView.extend({
    template: '#budget-balance',
    initialize: function() {
        this.listenTo(this.model, 'change', this.render);
    },
});

var BudgetActionsView = M.ItemView.extend({
    template: '#budget-actions',

    events: {
        'click [data-reset-budget]': 'resetBudget',
    },

    resetBudget: function() {
        debugger;
        this.model.resetBudget();
    },
});

var GrandTotalView = M.ItemView.extend({

    template: _.template($('#total-row').html()),

    serializeData: function() {
        return {
            grand_total: this.model.grandTotal()
        };
    },

});

function main() {

    // TODO cleanup all this global stuff, naming conventions
    
    window.App = new AppModel({id: 1});

    var expenses = new Expenses();
    var budgets = new Budgets();
    window.BudgetList = budgets;
    window.ExpensesList = expenses;

    App.fetch();
    expenses.fetch();
    budgets.fetch();

    window.appLayout = new AppLayout({
        el: '[data-app]',
        model: App,
    });

    appLayout.render();

}

main();
